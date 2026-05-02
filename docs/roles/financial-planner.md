# ファイナンシャルプランナー仕様書 — kakebo「翌月赤字ゼロ」計算ロジック

本書は kakebo（カード中心生活者向け家計簿SaaS）における「来月赤字を確実に防ぐ」ための計算ロジック仕様である。
カードは n 個・4 つの請求グループ（PayPay / セゾン / イオン / JCB）に所属し、グループごとに締め日・引落日が異なる。
ローンはボーナス加算（6月・12月）あり、収入は月収＋年2回ボーナス、カードのボーナス払いは利用しない前提。

---

## 0. 用語と内部データモデル

| 概念 | 説明 |
|---|---|
| `BillingGroup` | 請求グループ（PayPay/セゾン/イオン/JCB）。`closing_day`（締め日, 1–31 or "末日"）と `withdrawal_rule`（引落日ルール）を持つ |
| `Card` | カード。`billing_group_id` を1つ持つ |
| `Transaction` | カード利用1件。`card_id`, `used_at`, `amount` |
| `BillingCycle` | 1請求サイクル。`group_id`, `period_start`, `period_end`（=締め日）, `withdrawal_date`, `total_amount` |
| `Loan` | ローン。`monthly`, `bonus_addon`, `bonus_months: [6, 12]`, `withdrawal_day` |
| `Income` | 収入。`monthly_take_home`, `bonus_amount`, `bonus_months: [6, 12]` |
| `SafetyBuffer` | 安全余裕（ユーザー設定 or デフォルト=月収の5%） |

すべての金額は「円・整数」、日付は「JST のローカル日付」で扱う。

---

## 1. 締め日・引落日の正確な計算ロジック

### 1.1 基本モデル

各 `BillingGroup` は次を持つ：

```
billing_group {
  closing_day: int | "EOM"          // 例: 15 or "EOM"（末日）
  withdrawal_offset_months: int     // 締め月から何ヶ月後に引落か（多くは 1 or 2）
  withdrawal_day: int | "EOM"       // 例: 27 or "EOM"
  closing_holiday_policy: "shift_back" | "as_is"   // 締め日が休日の場合
  withdrawal_holiday_policy: "next_business_day"   // 引落日が休日の場合
}
```

**実務慣習：**
- **締め日**は「日付ベース」でカウントするのが一般的（土日祝でもその日に締まる）。請求サイクルは内部論理日付なので `closing_holiday_policy = "as_is"` が既定。ただしカード会社によっては「締め日が土日祝なら前営業日に前倒し」を採るところもあり、グループ単位で設定可能にする。
- **引落日**は「金融機関の引落」なので、土日祝にあたる場合は **翌営業日に倒す**（`next_business_day`）のが日本の銀行口座振替の標準。
- 月末締めかつ月末引落（例：JCB 月末締め翌々月10日引落のような変則）にも対応するため `closing_day` と `withdrawal_day` は `"EOM"` を許容。

### 1.2 「5/15 締め 6/27 引落」のグループに 5/20 に使ったらどうなるか

```
- 利用日 used_at = 2026-05-20
- 5月の締め日 = 5/15 → 5/20 は「5/15 を超えている」ので 5月サイクルには入らない
- 次の締め = 6/15 → 5/20 は (5/16 〜 6/15) の請求サイクルに帰属
- そのサイクルの引落 = 7/27（6/15 締めの翌月27日）
→ 5/20 の利用は 7/27 に引き落とされる
```

これは「**月跨ぎ取引**」の典型。`used_at` が「前月締め日の翌日 〜 当月締め日」の窓に入るかで帰属サイクルを決める。

### 1.3 月跨ぎ取引の判定式（疑似コード）

```python
def assign_billing_cycle(tx, group):
    """tx.used_at をどの BillingCycle に入れるか決定"""
    closing = group.closing_day  # int or "EOM"

    # 当該利用月の締め日（実日付）を解決
    this_month_closing = resolve_closing_date(tx.used_at.year, tx.used_at.month, closing)
    # 例外：締め日が土日祝のとき、グループポリシーで前倒し
    if group.closing_holiday_policy == "shift_back":
        this_month_closing = previous_business_day_if_holiday(this_month_closing)

    if tx.used_at <= this_month_closing:
        # 当月サイクルに帰属
        cycle_month = (tx.used_at.year, tx.used_at.month)
    else:
        # 翌月サイクルに帰属（月跨ぎ）
        cycle_month = add_months((tx.used_at.year, tx.used_at.month), 1)

    period_end = resolve_closing_date(*cycle_month, closing)
    period_start = next_day(resolve_closing_date(*sub_months(cycle_month, 1), closing))

    # 引落日 = period_end の月から withdrawal_offset_months 後の withdrawal_day
    wd_year, wd_month = add_months(cycle_month, group.withdrawal_offset_months)
    raw_wd = resolve_closing_date(wd_year, wd_month, group.withdrawal_day)
    withdrawal = next_business_day_if_holiday(raw_wd)  # 引落は翌営業日に倒す

    return BillingCycle(group, period_start, period_end, withdrawal)


def resolve_closing_date(year, month, day_spec):
    if day_spec == "EOM":
        return last_day_of_month(year, month)
    # 2/30 など実在しない日付は末日に丸める
    return min(date(year, month, day_spec), last_day_of_month(year, month))


def next_business_day_if_holiday(d):
    while is_weekend(d) or is_jp_holiday(d):
        d = d + 1 day
    return d
```

**祝日カレンダー**は `jpholiday` 等で内部に持ち、**振替休日**にも対応する（5/3 が日曜なら 5/6 が振替休日 → 5/6 引落なら 5/7 へ繰り延べ）。

### 1.4 4グループの想定既定値（例）

| グループ | 締め日 | 引落日 | offset |
|---|---|---|---|
| PayPay カード | 月末 | 翌月27日 | +1ヶ月 |
| セゾン | 10日 | 翌月4日 | +1ヶ月 |
| イオン | 10日 | 翌月2日 | +1ヶ月 |
| JCB | 15日 | 翌月10日 | +1ヶ月 |

※ ユーザーが個別に上書きできること。

---

## 2. 「翌月赤字」を判定する KPI 設計

### 2.1 単純判定では不十分

`総出金 > 収入` だけでは「貯金ゼロでギリギリ生き延びる」状態を緑判定してしまう。FP 視点では **貯蓄目標を含めた可処分収入** で評価する。

### 2.2 KPI 定義

ある対象月 M における中核 KPI：

```
予測引落合計(M)     = Σ(BillingCycle.total) where withdrawal in M
                   + Σ(Loan.amount_for_month(M))
                   + Σ(固定支出.amount in M)        // 家賃・光熱・サブスク等

予測収入(M)         = monthly_take_home + (bonus if M in bonus_months else 0)

貯蓄目標(M)         = saving_goal_monthly
                   + (bonus_saving_goal if M in bonus_months else 0)

安全余裕(M)         = max(monthly_take_home * 0.05, 10,000円)   // 既定

可処分余力(M)       = 予測収入(M) - 予測引落合計(M) - 貯蓄目標(M) - 安全余裕(M)
```

### 2.3 信号色の閾値（根拠つき）

| 色 | 条件 | 根拠 |
|---|---|---|
| 緑 | `可処分余力(M) ≥ 0` かつ `予測引落合計(M) ≤ 予測収入(M) × 0.85` | 一般的な家計の「健全ライン：手取りの85%以内に支出を収める」（金融広報中央委員会の家計指針に準拠） |
| 黄 | `可処分余力(M) ≥ 0` だが `予測引落合計(M) > 予測収入(M) × 0.85`、または `0 > 可処分余力(M) ≥ -安全余裕` | 貯蓄目標を達成できない、または安全余裕を食う水準。即赤字ではないが要警戒 |
| 赤 | `可処分余力(M) < -安全余裕(M)`、すなわち `予測引落合計+貯蓄目標 > 予測収入+安全余裕` | 安全余裕を超えてマイナス。実質赤字確定の予兆 |

### 2.4 補助 KPI

- **キャッシュ・ランウェイ**：`預金残高 ÷ 月平均引落` … 「あと何ヶ月生きられるか」。3ヶ月未満で警告。
- **カード引落集中度**：1日に集中する引落額が `預金残高 × 0.5` を超えたら警告（残高不足リスク）。

---

## 3. ボーナス加算ローンの月別表現

### 3.1 内部データ構造

```python
loan = {
  "name": "住宅ローン",
  "monthly_amount": 30_000,
  "bonus_addon": 100_000,
  "bonus_months": [6, 12],
  "withdrawal_day": 27,
  "start": "2024-04",
  "end":   "2059-03"
}
```

### 3.2 月別展開関数

```python
def loan_amount_for_month(loan, year, month):
    if not in_range(loan, year, month):
        return 0
    base = loan.monthly_amount
    addon = loan.bonus_addon if month in loan.bonus_months else 0
    return base + addon
```

例：月額3万＋ボーナス10万 → 1〜5月=3万、6月=13万、7〜11月=3万、12月=13万。

**UI 表現**：月次画面では「30,000 + ボーナス加算 100,000 = 130,000」と分解表示し、ユーザーに「なぜ今月だけ高いか」を一目で伝える。
**集計**：年合計 = `monthly × 12 + bonus_addon × len(bonus_months)`。年収比チェックに使う（年返済比率 ≤ 35% を黄、≤ 25% を緑）。

---

## 4. 収入モデル

### 4.1 手取り or 額面 — どちらで持つか

**結論：ユーザーが入力するのは「手取り」を既定にする。** 内部では両方持てる構造にする。

理由：
- 家計簿の目的は「使えるお金」の把握。額面で持つと社保・税が抜けて過大評価される（典型的に額面の 75〜80% が手取り）。
- 額面入力させると「ボーナスから引かれる社会保険・所得税」の概算ロジックが必要になり、UXコストが高い。
- ただし住民税・所得税が別払い（普通徴収・確定申告）のフリーランスは「額面 − 概算税」で持ちたい需要があるため、`income_input_mode: "take_home" | "gross"` を選択可能に。

### 4.2 データ構造

```python
income = {
  "monthly_take_home": 320_000,
  "bonus_amount": 600_000,     // 1回あたり手取り
  "bonus_months": [6, 12],
  "input_mode": "take_home",
  "gross_monthly": null         // gross モード時に使用
}
```

### 4.3 ボーナス支給月の扱い

- ボーナスは支給月の収入に **加算**（合算ではなく内訳明示）。
- 黄/赤判定にボーナスを含める一方、**「ボーナス依存率」= ボーナス年額 ÷ 年収** を別 KPI として表示（30% 超で黄、50% 超で赤の警告）。
- ボーナスを食い潰す月別の予算組みは禁じ手として、ユーザーが「ボーナスの〇% を貯蓄」目標を立てられるようにする（既定 50%）。

---

## 5. 「あといくら使えるか」の計算式

### 5.1 当月安全使用可能額（1日あたり）

```
当月の安全使用可能額_per_day(today)
  = ( 予測収入(M_now)
      − 既確定出金(M_now, until=today)        // 既に確定したカード利用＋引落＋固定費
      − 翌月引落予定の積み増し分(M_now+1)     // 当月利用が翌月に引落になる分の見込み
      − 貯蓄目標(M_now)
      − 安全余裕(M_now)
    ) ÷ 残日数(today, end_of_month)
```

**「翌月引落予定の積み増し分」の意味**：当月のカード利用は来月以降に引落される。だが「当月の収入で来月の引落を賄う」つもりがなければ来月赤字確定。よって、当月のうちに来月引落分を **収入から取り置く** ことを前提にして残額を計算する。

### 5.2 疑似コード

```python
def safe_daily_budget(today):
    M = month_of(today)
    income_M = predicted_income(M)
    fixed_out_M = fixed_outflows(M)              // 家賃・サブスク・ローン・既締め分カード引落
    pending_card_use = sum_card_tx(used_at_month=M)  // 当月利用済みで翌月以降引落
    saving = saving_goal(M)
    buffer = safety_buffer(M)
    days_left = days_until_eom(today)
    if days_left <= 0: days_left = 1

    return (income_M - fixed_out_M - pending_card_use - saving - buffer) / days_left
```

### 5.3 表示例

> 今月あと **18日**、安全に使えるのは1日 **約 4,200円**（合計 75,600円）。
> このペースなら6月の赤字を回避できます。

ペースを超過した日は赤バー、下回った日は緑バーでカレンダー表示。

---

## 6. 見落としがちな実務ケース

| ケース | 罠 | kakebo の対応 |
|---|---|---|
| **カード年会費** | 年1回（多くは更新月）に 1〜3万の不規則引落。月次予算を一気に崩す | `RecurringCharge(period="yearly", month=N, amount=...)` として登録。前月から黄信号で予兆表示 |
| **保険料の年払い・半年払い** | 月払いより安いが資金繰りが歪む。同月にボーナス払いローンと重なると致命傷 | 年/半年払いも `RecurringCharge` で月別展開。ボーナス月との衝突を `collision_warning` で表示 |
| **固定資産税・自動車税** | 4〜6月に集中。3〜5万の現金引落が同時期に来る | 4期分割払い・一括払いの選択を保存。第1期の納期限までに黄予告 |
| **NHK・町内会等** | 半年/年払いの小〜中額。忘れがち | 同上 |
| **カード再発行で支払日変更** | 紛失再発行や種別変更で「今月だけ引落日が動く」ケースあり | `BillingCycle.withdrawal_date` をユーザーがその月だけ手動上書き可能に。次月以降は自動で既定に戻る |
| **リボ払いの罠** | 利用額が増えても引落は定額のまま、残債が膨らむ。月次「総出金」では見えない | カード単位で `revolving_balance` を保持。残債と実質金利（年15%等）を表示。「黄信号KPI」として `リボ残高 ÷ 月収` を別建てで管理 |
| **分割払い** | 24回払い等は将来複数月にまたがる確定債務 | 利用時点で `installment_schedule` を全月展開し、未来の引落予測に必ず含める |
| **海外利用・為替差額** | 利用日と確定日でレートが変わり、後日「事務手数料 + 為替差」で追加引落される | 直近30日のカード利用に対しては +2.5% の予備見込みを加算（保守的） |
| **キャンペーン・キャッシュバック遅延** | 還元はあてにすると危険。引落は先、還元は数ヶ月後 | キャッシュバックは「収入」ではなく確定した月だけ計上 |
| **口座残高不足による再振替** | 1度落ちないと延滞金・信用情報傷つく | 引落日3営業日前に「口座残高 < 引落予定」なら赤通知 |
| **家族カード・ETC** | 本会員の請求にまとめられるが、本人の心当たりがない利用が紛れる | カード単位で「サブカード」紐付け。利用通知を本会員に集約 |

---

## 7. ユーザー教育コンテンツ案 — アプリに埋め込む FP の知見

### 7.1 「赤字防止の3原則」（オンボーディング & ホーム下部に常設）

1. **「今月の収入で、来月の引落を賄う」**
   カード払いは2ヶ月後の自分への借金。今日の使い過ぎは来月の自分を追い詰める。
2. **「貯める分は、引いてから残りで暮らす」（先取り貯蓄）**
   貯蓄は「余ったらする」ではなく、給与日に自動で別口座へ移す前提で家計を組む。kakebo の安全使用可能額は貯蓄を引いた後の値。
3. **「年に数回の大物を、月割で覚悟する」**
   年会費・税金・保険・車検は月割で先取り。ボーナスを期待値に組み込みすぎない（依存率30%以下が目安）。

### 7.2 月次レビュー画面の固定メッセージ

- 緑：「今月は手取りの85%以内に収まり、貯蓄目標も達成見込みです。良いペースです。」
- 黄：「貯蓄目標までは届きません。来月に向けてサブスクや変動費を見直しましょう。」
- 赤：「このままだと安全余裕を超えて赤字です。今月残りの安全使用可能額は1日◯円までです。」

### 7.3 マイクロ学習カード（週1配信）

- 「リボ払いは年15%の借金です」
- 「ボーナス払いカードを使わないだけで、家計は驚くほど安定します」
- 「固定費1つ見直しは、変動費10回我慢に勝る」
- 「黒字家計の中央値：手取り320kなら貯蓄55k（17%）」

### 7.4 ライフイベント前アラート

結婚・出産・引越し・車購入を登録すると、半年前から「想定支出」を自動加算し、貯蓄ペースを再計算して提示。

---

## 8. 実装上の注意（優先順位）

1. **タイムゾーンと日付の一貫性**：すべて JST のローカル日付で扱い、UTC との混同を排除。
2. **祝日マスタの更新**：年1回の更新（春の閣議決定や臨時祝日）に追従できる仕組み。
3. **BillingCycle の冪等再計算**：取引追加・締め日変更で再計算が走るが、過去確定済みサイクルは凍結（`is_finalized=true`）。
4. **未来予測は3ヶ月先まで**：それ以遠は不確実性が高く、誤った安心感を与える。
5. **テストケースの最低ライン**：
   - 月末締め × 月末引落の境界
   - 締め日が日曜・祝日 × 各 holiday_policy
   - ボーナス月とローンボーナス加算月の合致
   - 5/20 利用 → 7/27 引落 の例（本書 §1.2）が必ず通ること

---
