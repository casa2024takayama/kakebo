# Data / ML Engineer ロール設計書

kakebo（家計簿SaaS）の差別化要因「自動化」機能のアルゴリズム設計。

> 原則：Phase 1 はルールベースで素早く出荷 → ユーザー訂正データを蓄積 → Phase 2 で軽量モデル/埋め込みを段階導入。学習データが乏しい初期は事前学習モデル・プロンプトエンジニアリングで賄う。

---

## 1. 固定費自動検出アルゴリズム

### 1.1 ロジック概要

「同一摘要 × 月1回 × 金額±10% × 3〜6ヶ月連続」を満たす取引クラスタを固定費として推定する。

### 1.2 疑似コード

```python
def detect_fixed_costs(transactions: list[Tx], today: date) -> list[FixedCost]:
    # Step 1: 摘要を正規化してグルーピング
    groups = defaultdict(list)
    for tx in transactions:
        if tx.amount >= 0:               # 出金のみ対象（収入は別ロジック）
            continue
        key = normalize_description(tx.description)
        if is_excluded_keyword(key):     # カード引落・振込手数料などを除外
            continue
        groups[key].append(tx)

    candidates = []
    for key, txs in groups.items():
        txs.sort(key=lambda t: t.date)

        # Step 2: 月単位にバケット化（同月複数件は最頻金額を採用）
        monthly = bucketize_monthly(txs)

        # Step 3: 直近 N=6 ヶ月で連続性を判定
        last_6 = [monthly.get(m) for m in last_n_months(today, 6)]
        consecutive = longest_consecutive_run(last_6)
        if consecutive < 3:
            continue

        # Step 4: 金額の安定度（中央値±10%以内に何ヶ月収まっているか）
        amounts = [m.amount for m in last_6 if m]
        median_amt = median(amounts)
        stable_ratio = sum(
            1 for a in amounts if abs(a - median_amt) / median_amt <= 0.10
        ) / len(amounts)

        # Step 5: 信頼度スコア
        score = confidence_score(
            consecutive=consecutive,
            stable_ratio=stable_ratio,
            n_months=len(amounts),
            interval_regularity=interval_cv(txs),
        )
        if score >= 0.6:
            candidates.append(FixedCost(
                label=key,
                amount=median_amt,
                billing_day=mode_day(txs),
                score=score,
                samples=txs,
            ))
    return candidates
```

### 1.3 信頼度スコア計算式

```
score =  0.35 * (consecutive_months / 6)        # 連続性
       + 0.30 * stable_ratio                    # 金額安定度（±10%以内の割合）
       + 0.20 * (1 - interval_cv)               # 引落間隔のばらつき（変動係数の逆）
       + 0.15 * min(n_months / 6, 1.0)          # サンプル量
```

- `interval_cv` = stdev(間隔日数) / mean(間隔日数)、上限1.0でクリップ
- 0.6 以上 = 自動登録候補としてユーザー提示
- 0.8 以上 = デフォルトでON

### 1.4 カード引落の除外キーワード

カード引落や立替は「内訳の親」なので固定費の二重計上を防ぐ。摘要の正規化後に部分一致で除外。

```python
EXCLUDE_KEYWORDS = [
    # クレジットカード会社
    "JCB", "VISA", "ﾋﾞｻﾞ", "MASTER", "ﾏｽﾀ-", "AMEX",
    "三井住友カード", "三井住友ｶ-ﾄﾞ", "SMBCカード",
    "楽天カード", "ﾗｸﾃﾝｶ-ﾄﾞ", "RAKUTEN CARD",
    "セゾン", "ｾｿﾞﾝ", "エポス", "ｴﾎﾟｽ",
    "イオンカード", "ｲｵﾝｶ-ﾄﾞ",
    "DCカード", "MUFGカード", "ニコス", "ﾆｺｽ",
    "PayPayカード", "ﾍﾟｲﾍﾟｲｶ-ﾄﾞ",
    # 汎用
    "カード利用", "ｶ-ﾄﾞﾘﾖｳ", "ご利用代金", "ﾘﾖｳﾀﾞｲｷﾝ",
    # 振込手数料・口座振替手数料（誤検出元）
    "振込手数料", "振替手数料", "ATM手数料",
    # 自分名義の振替（ペイジー・口座間振替）
    "振替", "口座振替", "自動振替",
]

CREDIT_BILLING_HINT_RE = re.compile(
    r"(カ[-ー]?ド|CARD|VISA|JCB|MASTER|AMEX).{0,8}(利用|代金|引落|請求|決済)?"
)
```

ただし完全に消すと「クレカ引落＝固定費の入口」が消えるため、`category=credit_settlement` として別系統で記録し、UI 上は固定費表示から除外するが「カード明細インポート」誘導の起点として保持する。

### 1.5 エッジケース処理

#### (a) 摘要への日付・連番混入

例：`AMAZON 0428`, `AMAZON.CO.JP 20260428`, `Netflix 04/28`

```python
DATE_NOISE_RE = re.compile(r"""
    (?:^|\s)
    (?:
        \d{4}[-/.]?\d{1,2}[-/.]?\d{1,2}   # 20260428 / 2026-04-28
      | \d{1,2}[-/.]\d{1,2}               # 04/28
      | \d{6,8}                            # 連続数字（伝票番号）
    )
    (?=\s|$)
""", re.VERBOSE)

SEQUENCE_RE = re.compile(r"\b\d{4,}\b")    # ATM伝票番号など

def normalize_description(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)        # 半角全角・カナ統一
    s = s.upper()
    s = DATE_NOISE_RE.sub(" ", s)
    s = SEQUENCE_RE.sub(" ", s)
    s = re.sub(r"[（）()【】\[\]・\.\-_/]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # 末尾の店舗番号 "ﾏｸﾄﾞﾅﾙﾄﾞ 1234店" → "マクドナルド"
    s = re.sub(r"\s\d+店?$", "", s)
    return s
```

#### (b) 半角全角・カナ統一

`NFKC` で `ﾏｸﾄﾞﾅﾙﾄﾞ` → `マクドナルド`、全角数字 → 半角、`ＡＭＡＺＯＮ` → `AMAZON`。

#### (c) 振込手数料の差異吸収

ネット銀の他行宛振込で「家賃 80,000 + 手数料 220」となるケース。

- `bucketize_monthly` で同月内の同摘要を合算する際、手数料相当（≤500円かつ "手数料" 摘要が同日に存在）は別取引として分離
- 固定費判定時の金額は手数料を除いた本体金額で評価

#### (d) 月またぎ・休日スキップ

- 25日固定の家賃が土日で26日にずれる等、`billing_day` は最頻値±3日許容
- `interval_cv` 計算時は休日補正後の理論引落日との差で評価

---

## 2. 銀行CSV様式の自動判別

### 2.1 主要銀行の列構成サンプル

| 銀行 | 列構成（左から） | 文字コード | 日付フォーマット |
|---|---|---|---|
| 三菱UFJ銀行 | `日付, 摘要, 摘要内容, 支払金額, 預入金額, 差引残高, メモ, 未資金化区分, ラベル` | Shift_JIS | `2026/04/28` |
| 三井住友銀行 (SMBC) | `年月日, お引出し, お預入れ, お取り扱い内容, 残高` | Shift_JIS | `2026/4/28` |
| 楽天銀行 | `取引日, 入出金(円), 残高(円), 入出金内容` | UTF-8 BOM | `20260428` |
| ゆうちょ銀行 | `お取扱日, 受払区分, 金額, 取扱内容, 取扱店, 残高` | Shift_JIS | `2026.04.28` / 和暦 |
| 住信SBIネット銀行 | `日付, 内容, 出金金額(円), 入金金額(円), 残高(円), メモ` | UTF-8 | `2026/04/28` |
| PayPay銀行 | `日付, 摘要, お支払金額, お預り金額, 残高, メモ` | UTF-8 | `2026/04/28` |
| ジャパンネット銀行 (旧) | `取引日,内容,出金金額,入金金額,取引後残高` | Shift_JIS | `2026/04/28` |

### 2.2 列名キーワードマッチング戦略

各論理カラムに対し、エイリアス辞書を持ち「ヘッダ行を NFKC 正規化＋小文字化＋括弧除去」したうえでスコアリング。

```python
COLUMN_ALIASES = {
    "date":     ["日付", "取引日", "お取扱日", "年月日", "お取引日", "計算日"],
    "desc":     ["摘要", "内容", "取扱内容", "お取り扱い内容", "入出金内容", "摘要内容"],
    "withdraw": ["支払金額", "出金金額", "お引出し", "お支払金額", "出金"],
    "deposit":  ["預入金額", "入金金額", "お預入れ", "お預り金額", "入金"],
    "amount":   ["入出金", "金額", "取引金額"],   # 入出金一体カラム
    "balance":  ["残高", "差引残高", "取引後残高"],
    "memo":     ["メモ", "備考", "ラベル"],
}

def detect_schema(header: list[str]) -> dict[str, int]:
    norm = [unicodedata.normalize("NFKC", h).strip().lower() for h in header]
    norm = [re.sub(r"[（）\(\)]([^（）\(\)]*)$", "", h) for h in norm]  # "金額(円)" → "金額"

    mapping = {}
    for logical, aliases in COLUMN_ALIASES.items():
        best_idx, best_score = -1, 0
        for i, h in enumerate(norm):
            for a in aliases:
                a2 = unicodedata.normalize("NFKC", a).lower()
                score = similarity(h, a2)        # SequenceMatcher / 部分一致重み付け
                if score > best_score:
                    best_idx, best_score = i, score
        if best_score >= 0.7:
            mapping[logical] = best_idx
    return mapping
```

#### 入出金が単一カラム vs 2カラムの判定

- `withdraw` & `deposit` の両方が見つかる → 2カラム型（UFJ・SMBC・住信SBI・PayPay 等）
- `amount` のみ見つかる → 1カラム型（楽天等。符号 or `+/-` で入出金判定）
- 「受払区分」がある（ゆうちょ）→ 区分列の値で判別（"払出"/"預入"）

#### ヘッダがない／複数行ヘッダ

- 先頭5行を読み、各行をヘッダ候補として `detect_schema` し、最高一致数の行をヘッダと採用
- メタ情報行（口座番号・出力日など）は数値・日本語ラベル比率でスキップ

### 2.3 日付フォーマット推定

```python
DATE_FORMATS = [
    "%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d",
    "%Y%m%d",
    "%Y/%-m/%-d", "%Y-%-m-%-d",
    "%y/%m/%d",
]

WAREKI_RE = re.compile(r"^([RHSrhs令平昭])(\d{1,2})[./年](\d{1,2})[./月](\d{1,2})日?$")
ERA_OFFSET = {"R": 2018, "令": 2018, "H": 1988, "平": 1988, "S": 1925, "昭": 1925}

def parse_date(s: str) -> date:
    s = unicodedata.normalize("NFKC", s).strip()
    if (m := WAREKI_RE.match(s)):
        era, yy, mm, dd = m.groups()
        return date(ERA_OFFSET[era.upper() if era.isascii() else era] + int(yy),
                    int(mm), int(dd))
    for fmt in DATE_FORMATS:
        try: return datetime.strptime(s, fmt).date()
        except ValueError: continue
    raise ValueError(f"未知の日付形式: {s!r}")

def infer_date_format(samples: list[str]) -> str:
    """先頭10件で投票、多数決でフォーマット確定。残りはバルク変換。"""
    votes = Counter()
    for s in samples[:10]:
        for fmt in DATE_FORMATS:
            try:
                datetime.strptime(s, fmt); votes[fmt] += 1; break
            except ValueError: pass
    return votes.most_common(1)[0][0] if votes else None
```

### 2.4 文字コード自動判定

```python
def detect_encoding(raw: bytes) -> str:
    # 1. BOM 確認
    if raw.startswith(b"\xef\xbb\xbf"): return "utf-8-sig"
    if raw.startswith(b"\xff\xfe"):     return "utf-16-le"
    if raw.startswith(b"\xfe\xff"):     return "utf-16-be"

    # 2. UTF-8 として decode できるか試す（厳格モード）
    try:
        raw.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        pass

    # 3. chardet/charset-normalizer を fallback、ただし日本語CSVは
    #    Shift_JIS と CP932 が混在するので CP932 を優先（"髙" など機種依存対応）
    guess = charset_normalizer.from_bytes(raw).best()
    enc = (guess.encoding or "cp932").lower()
    if enc in ("shift_jis", "shift-jis", "ms932"):
        return "cp932"
    return enc
```

判定後はサンプル100行を decode してエラーがないか再検証。失敗したら `cp932` → `shift_jis` → `utf-8-sig` の順でフォールバック。

---

## 3. 取引のカテゴリ自動分類

### 3.1 Phase 1：キーワード辞書方式

```python
CATEGORY_KEYWORDS = {
    "食費・コンビニ": [
        "セブン", "ｾﾌﾞﾝ", "7-ELEVEN", "ローソン", "ﾛｰｿﾝ",
        "ファミリーマート", "ﾌｧﾐﾘ", "FAMILYMART", "ミニストップ",
    ],
    "食費・スーパー": [
        "イオン", "ｲｵﾝ", "AEON", "西友", "OKストア", "ライフ", "成城石井",
        "マルエツ", "サミット", "業務スーパー",
    ],
    "外食": [
        "マクドナルド", "ﾏｸﾄﾞﾅﾙﾄﾞ", "MCDONALD", "スターバックス", "STARBUCKS",
        "サイゼリヤ", "ガスト", "吉野家", "すき家", "松屋", "ドトール",
    ],
    "交通費": [
        "JR東日本", "JR東海", "JR西日本", "東京メトロ", "都営交通",
        "ICOCA", "SUICA", "PASMO", "MOBILE PASMO", "MOBILE SUICA",
        "高速道路", "ETC", "タクシー", "GO",
    ],
    "通信費": [
        "ドコモ", "ﾄﾞｺﾓ", "DOCOMO", "AU", "KDDI", "SOFTBANK", "ソフトバンク",
        "楽天モバイル", "ｱﾊﾟﾜｰ", "BIGLOBE", "OCN", "NURO", "フレッツ",
    ],
    "サブスク": [
        "NETFLIX", "SPOTIFY", "AMAZON PRIME", "PRIME VIDEO", "DISNEY",
        "APPLE COM BILL", "GOOGLE", "YOUTUBE", "ICLOUD", "ADOBE",
        "CHATGPT", "ANTHROPIC", "MICROSOFT 365",
    ],
    "光熱費": [
        "東京電力", "ＴＥＰＣＯ", "TEPCO", "東京ガス", "大阪ガス",
        "水道", "東京水道局", "関西電力", "中部電力",
    ],
    "住居費": ["家賃", "管理費", "賃料", "ﾔﾁﾝ", "駐車場"],
    "医療": ["薬局", "病院", "クリニック", "ﾄﾞﾗｯｸﾞ", "ドラッグ", "ツルハ", "マツキヨ"],
}
```

マッチング戦略：

```python
def classify(desc_normalized: str, user_overrides: dict) -> tuple[str, float]:
    # 1. ユーザー過去訂正の完全一致を最優先
    if cat := user_overrides.get(desc_normalized):
        return cat, 1.0

    # 2. 辞書キーワード部分一致（より長いキーワードを優先）
    matches = []
    for cat, kws in CATEGORY_KEYWORDS.items():
        for kw in kws:
            if kw in desc_normalized:
                matches.append((cat, len(kw)))
    if matches:
        matches.sort(key=lambda x: -x[1])
        return matches[0][0], 0.7 + min(matches[0][1] / 20, 0.25)

    # 3. fallback: その他
    return "その他", 0.1
```

### 3.2 Phase 2：埋め込み類似度

辞書未ヒット or 信頼度<0.5 のものに対し、埋め込みベクトルで「カテゴリ代表ベクトル」との cosine 類似度を取る。

- 埋め込みモデル候補：
  - **OpenAI `text-embedding-3-small`**（1536次元、$0.02/1M tokens、多言語良好）
  - **`intfloat/multilingual-e5-small`**（オープン、自前ホスト可、日本語◎）
  - **`pkshatech/GLuCoSE-base-ja`**（日本語特化、軽量）
- カテゴリ代表ベクトル：辞書キーワード＋ユーザー訂正データの重心（centroid）
- 推論はクライアントに保存可能な小型モデルを優先（プライバシー＋コスト）

```python
def classify_v2(desc_norm: str, threshold=0.62) -> tuple[str, float]:
    if (cat := dict_match(desc_norm)).score >= 0.7:
        return cat
    v = embed(desc_norm)
    sims = {c: cosine(v, centroid[c]) for c in CATEGORIES}
    best, score = max(sims.items(), key=lambda x: x[1])
    return (best, score) if score >= threshold else ("その他", score)
```

### 3.3 学習データの作り方（フィードバックループ）

| ステージ | データ源 | 件数感 |
|---|---|---|
| 0 | 辞書のシードラベル | 数百〜千 |
| 1 | ユーザーがUIで訂正したもの（ユーザー単位） | 〜数百/ユーザー |
| 2 | オプトインしたユーザーから匿名集約 | 数万〜 |
| 3 | 集約データで centroid 再学習 → 全ユーザーへ反映 | 月次バッチ |

訂正イベントの保存スキーマ：

```sql
CREATE TABLE category_feedback (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL,
  desc_norm     text NOT NULL,         -- 正規化後（個人情報残らない形を維持）
  predicted     text NOT NULL,
  corrected     text NOT NULL,
  amount_bucket text NOT NULL,         -- "<1k" / "1-3k" / "3-10k" / ">10k" 等粗化
  bank_kind     text,
  opt_in_share  boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
```

ユーザー単位の `corrected` は最優先（決め打ち）、共有プールは`opt_in_share=true`のみ集約に使用。

---

## 4. レシートOCR

### 4.1 既存実装

Claude Vision API（claude-opus-4 / claude-sonnet-4 系）に画像＋構造化出力プロンプト。

### 4.2 代替候補比較

| プロバイダ | 強み | 弱み | コスト感 | 推奨用途 |
|---|---|---|---|---|
| Claude Vision (現行) | プロンプト制御で構造化出力が安定。日本語◎、文脈理解で「税抜/税込」判別可 | レイアウト座標は出ない。スループット中 | $$ | 主力 |
| Google Cloud Vision (Document AI / Receipt parser) | 日本語OCR最高精度クラス、座標bbox取得、Receipt用プリセット | 後処理（合計行特定など）は自前 or DocumentAI Processor 必要 | $〜$$ | 高精度フォールバック |
| Azure AI Document Intelligence (`prebuilt-receipt`) | 受領書専用モデル、店舗・小計・税・合計を構造化抽出。日本語対応 | 日本のローカルチェーンには弱い場合あり | $$ | エンタープライズ・代替 |
| Tesseract + 自前パース | 無料・オフライン | 精度低、レイアウト解析自前 | $0 | 最終フォールバック・オフライン |
| Mathpix / amiVoice OCR | 帳票特化型 | コスト高 | $$$ | 採用優先度低 |

### 4.3 プロンプト設計例（Claude Vision）

```text
あなたは日本のレシート読取アシスタントです。画像から以下のJSONを返してください。
不明な値は null。**絶対にJSON以外を出力しない**こと。

スキーマ:
{
  "store_name":      "店舗名（チェーン名のみ。支店名は除く）",
  "store_branch":    "支店名 or null",
  "purchased_at":    "ISO8601 (YYYY-MM-DDTHH:MM、時刻不明なら時刻部省略)",
  "subtotal":        "税抜小計 (整数円, null可)",
  "tax":             "消費税合計 (整数円, null可)",
  "total":           "支払合計 (整数円, 必須)",
  "payment_method":  "現金 / クレジット / 電子マネー / QR / 不明",
  "items": [
    {"name": "商品名", "qty": 1, "unit_price": 0, "amount": 0, "tax_rate": 8 | 10 | null}
  ],
  "currency":  "JPY",
  "confidence": 0.0-1.0
}

抽出ルール:
- 「合計」「お会計」「ご請求額」「TOTAL」のいずれかを total に。
- 軽減税率(8%)対象は ★ や 印 が付いている行を tax_rate=8 に。
- 「お預り」「お釣り」は items に含めない。
- 商品名は半角全角を統一(NFKC)し、末尾の値段やJANコードは除去。
- 店舗名は最上部 or レシート最下部の登記名から判定。
- 信頼度が0.5未満の場合 confidence をそのまま正直に返す。
```

抽出後の後処理：

```python
def postprocess_receipt(raw: dict) -> Receipt:
    # 1. 整合性チェック
    items_sum = sum(i["amount"] or 0 for i in raw["items"])
    if raw["total"] and items_sum and abs(items_sum - raw["total"]) / raw["total"] > 0.05:
        raw["confidence"] *= 0.7        # 不整合なら信頼度ペナルティ

    # 2. 店舗名→カテゴリ初期推定
    raw["category_guess"] = classify(normalize_description(raw["store_name"]))

    # 3. 日付の妥当性（未来日・1年以上前は警告）
    if raw["purchased_at"]:
        d = parse(raw["purchased_at"])
        if d > today() or d < today() - timedelta(days=400):
            raw["warnings"].append("date_out_of_range")
    return Receipt(**raw)
```

### 4.4 失敗時のフォールバック戦略

```
[撮影] → Claude Vision
   ├─ confidence ≥ 0.7 かつ total ≠ null → 採用
   ├─ confidence < 0.7 → Google Vision (Receipt) で再抽出 → 値の多数決
   └─ JSONパース失敗 / total 取れず
        → ユーザーに「ぼやけ/影/全体写ってない」フィードバック表示
        → 手動入力フォーム（store/total/dateだけ事前入力）
```

- 同一画像のリトライは指数バックオフ（最大3回）
- スマホ側で画像前処理：
  - 自動回転（EXIF + 矩形検出）
  - 明度補正（CLAHE）
  - 紙の四隅検出して台形補正

---

## 5. 異常検知

### 5.1 Phase 1：移動平均±2σ方式（カテゴリ単位／店舗単位）

```python
def detect_anomaly_v1(tx: Tx, history: list[Tx]) -> Anomaly | None:
    same_cat = [h.amount for h in history
                if h.category == tx.category and within_days(h, tx, 90)]
    if len(same_cat) < 10:
        return None

    mu = mean(same_cat)
    sigma = stdev(same_cat)
    z = (abs(tx.amount) - mu) / max(sigma, 1.0)

    # 店舗側（同一店舗で過去5件以上）
    same_shop = [h.amount for h in history
                 if h.merchant == tx.merchant]
    shop_alert = (len(same_shop) >= 5
                  and abs(tx.amount) > 2 * max(same_shop))

    if z >= 2.5 or shop_alert:
        return Anomaly(tx=tx, z=z, kind="amount" if z >= 2.5 else "merchant")
    return None
```

### 5.2 Phase 2：Isolation Forest

特徴量：
- 金額（log変換）
- 曜日 / 時間帯
- カテゴリ one-hot
- 店舗のユーザー固有頻度（rare-shop indicator）
- 直近30日の同カテゴリ支出からの偏差

```python
from sklearn.ensemble import IsolationForest

clf = IsolationForest(
    contamination=0.02,         # 2% を異常と仮定
    n_estimators=200,
    random_state=42,
)
clf.fit(featurize(train_txs))
score = -clf.score_samples(featurize([tx]))[0]
```

### 5.3 false positive を抑える工夫

1. **コールドスタート対策**：履歴<30件は判定スキップ。代わりに「初期想定額」をオンボーディングで聞く。
2. **二重ゲート**：移動平均と店舗頻度の両方が閾値超え時のみアラート（OR ではなく AND）。ただし「全く未知の高額店舗」は単独で発火。
3. **既知の固定費は除外**：固定費判定済みの取引は anomaly 評価対象外。
4. **季節性**：3月（送別会）、12月（忘年会）、4月（新生活）など月別 baseline。例：`mu_month = mean of same-month last 2 years`。
5. **しきい値の動的調整**：ユーザーが「これは想定内」を押した過去回数に応じて、その店舗/カテゴリのしきい値を緩める（per-user thresholds）。
6. **アラート上限**：1日3件まで、優先度（z スコア順）で間引き。
7. **静かな夜モード**：22:00〜翌7:00 はサイレント、まとめて朝に通知。

---

## 6. データ基盤の発展

### 6.1 Phase 1：クライアント完結

- CSVパース・固定費検出・カテゴリ分類すべてクライアント（ブラウザ／モバイル）で実行
- 取引データはローカル DB（IndexedDB / SQLite）に格納、E2E前提
- サーバーは認証・課金・OCR API プロキシのみ
- メリット：プライバシー強、サーバーコスト低
- 制約：横断分析・モデル学習に使えない

### 6.2 Phase 2：オプトイン蓄積（BigQuery 等）

```
[Client]
   │ user opts-in to "category dictionary improvement"
   ▼
[Anonymizer Worker (server-side, ephemeral)]
   - desc_norm のみ送信、金額は粗化バケット化、user_id は salted hash
   ▼
[BigQuery]  raw.category_feedback / raw.tx_summary
   ▼
[dbt + scheduled job (週次)]
   - カテゴリ centroid 更新
   - 全国版「固定費辞書」（Netflix=サブスク 等）の信頼度更新
   ▼
[Edge config / CDN] → クライアントへ配布
```

- 学習結果は **集約された辞書・centroid のみ配布**、生データは降ろさない
- 個別ユーザーの予測はクライアントで実行（サーバーに取引データを残さない）

### 6.3 ユーザー横断「固定費辞書」の育成

集約クエリ例：

```sql
SELECT
  desc_norm,
  APPROX_QUANTILES(amount_bucket_mid, 100)[OFFSET(50)] AS amount_p50,
  COUNT(DISTINCT user_hash)                            AS n_users,
  COUNTIF(is_fixed_cost) / COUNT(*)                    AS fixed_cost_rate
FROM raw.tx_summary
WHERE opt_in_share AND created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY desc_norm
HAVING n_users >= 50          -- k-匿名性 k=50
   AND fixed_cost_rate >= 0.7;
```

`n_users >= 50` は最低限の k-匿名性（後述）。

---

## 7. プライバシー考慮

### 7.1 設計原則

1. **デフォルトはローカルオンリー**。サーバー学習はオプトイン明示同意必須。
2. **データ最小化**：摘要文字列の正規化版＋粗化金額バケット＋カテゴリのみ送信。残高・口座番号・氏名は送らない。
3. **匿名化**：user_id は `HMAC-SHA256(global_salt + user_id)` で固定塩ハッシュ化、塩は Secret Manager 管理。
4. **k-匿名性**：辞書配布前に `n_users >= 50` を満たすキーのみ含める。
5. **取り消し権**：オプトアウト時、過去送信分も `category_feedback` から物理削除（GDPR/個人情報保護法準拠）。
6. **PII フィルタ**：摘要に氏名・電話番号・口座番号が混入する稀ケース用に、送信前に正規表現でマスク。

### 7.2 オプトインUIの誘導文（例）

> 「カテゴリ自動判定を全ユーザーで賢くするため、**店名と分類のペアだけ**を匿名で送ります。金額・残高・氏名は送りません。いつでも設定からOFFにできます。」

### 7.3 PIIマスク前処理

```python
PII_PATTERNS = [
    (re.compile(r"\d{4}-?\d{4}-?\d{4}-?\d{4}"), "<CARD>"),  # カード番号
    (re.compile(r"0\d{1,4}-?\d{1,4}-?\d{4}"), "<PHONE>"),
    (re.compile(r"\d{7}"), "<ACCOUNT>"),                    # 口座番号
    (re.compile(r"[一-龥]{1,3}\s?(様|殿)"), "<NAME>"),
]
def scrub(s: str) -> str:
    for pat, rep in PII_PATTERNS:
        s = pat.sub(rep, s)
    return s
```

---

## 付録 A：実装優先度ロードマップ

| 機能 | Phase 1 (MVP/3ヶ月) | Phase 2 (6〜12ヶ月) | Phase 3 (12ヶ月+) |
|---|---|---|---|
| 銀行CSV様式自動判別 | ◎ ルール＋エイリアス辞書 | ヘッダ無し対応 / OCR-CSV | コミュニティ提供サンプル拡充 |
| 固定費検出 | ◎ ルール＋スコア | 季節性考慮、変動固定費 | LLMでサブスク判定補助 |
| カテゴリ分類 | ◎ 辞書 + ユーザー上書き | 埋め込み類似度 | per-user fine-tune |
| レシートOCR | ◎ Claude Vision | Google Vision併用、自動前処理 | 店舗マスタ連携 |
| 異常検知 | ◯ 平均±2σ | Isolation Forest | 時系列モデル(LSTM/Prophet) |
| データ基盤 | ローカル | BQ + dbt（オプトイン） | リアルタイム feature store |

## 付録 B：評価メトリクス

| 機能 | KPI | 目標(Phase1終了時) |
|---|---|---|
| CSV判別 | 主要6行成功率 | 100% |
| 固定費検出 | precision / recall（ユーザー確認後） | P≥0.85 / R≥0.7 |
| カテゴリ分類 | top-1 accuracy | ≥0.75（辞書のみ）→ ≥0.88（埋め込み） |
| OCR | 合計金額の完全一致率 | ≥0.92 |
| 異常検知 | 1ユーザー1ヶ月当たりFP数 | ≤2件 |
