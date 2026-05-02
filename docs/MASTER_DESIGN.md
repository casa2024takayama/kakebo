# kakebo Master Design Document

> 作成日: 2026-05-02
> ステータス: 統合版 v1.0（社長決定反映済み）
> 編者: テックリード
> 入力: PdM / UI Designer / Cloud / FP / Security / Data-ML / QA の7名の設計書
> 位置付け: 各ロール文書の上位に立つ唯一の指針。矛盾は本書の記述を採る。

---

## 目次

1. [エグゼクティブサマリー](#1-エグゼクティブサマリー)
2. [製品要件](#2-製品要件)
3. [画面設計の要点](#3-画面設計の要点)
4. [アーキテクチャ（Phase別進化）](#4-アーキテクチャphase別進化)
5. [計算ロジック仕様](#5-計算ロジック仕様)
6. [セキュリティ要件（Phase別）](#6-セキュリティ要件phase別)
7. [データ・自動化機能](#7-データ自動化機能)
8. [品質保証](#8-品質保証)
9. [データモデル統合版](#9-データモデル統合版)
10. [段階的ロードマップ](#10-段階的ロードマップ)
11. [既存実装からの差分（コード変更指針）](#11-既存実装からの差分コード変更指針)
12. [オープンクエスチョン](#12-オープンクエスチョン)

---

## 1. エグゼクティブサマリー

### 1.1 プロダクトビジョン

**「来月のカード引落で口座が死なない」を当たり前にする。**

旧 kakebo は「カテゴリ別の使いすぎ防止」が主役だったが、日本のクレカは利用日と引落日にズレがあるため、月内のカテゴリ消化率では破綻を防げない。新 kakebo は **「翌月口座から消える金額 vs 収入」** を主役に置き、4つの請求グループ（PayPay / セゾン / イオン / JCB）の締め日サイクルとローン・収入を時系列で見える化する **キャッシュフロー破綻の早期警告システム** として再定義する。

### 1.2 社長決定（最優先・全章に反映）

| # | 決定 | 影響 |
|---|---|---|
| **D1** | **通貨ライブラリ不採用**。日本円のみなので標準 `number`（整数）で扱う。整数バリデーションで担保 | QA §7.2 の dinero.js 提案を上書き。実装は `bigint` 不要、`number` で `Number.MAX_SAFE_INTEGER`（≒9007兆）まで安全 |
| **D2** | **APIキー保管は Phase 1 では現状維持**（自分用なので localStorage 継続）。公開時に再設計 | Security §6 の Must は **Phase 4 適用** に降格。Phase 1〜3 は Should 相当に弱める |
| **D3** | **横断 ML 学習は不採用、真のニーズはマルチデバイス同期**。Data/ML §6.2 の BigQuery 集約辞書は不採用、Cloud §Phase2 の Supabase 案を Phase 2 中核に格上げ | Data/ML 提案の §6.2 / §7（共有プール）を全面削除。Supabase 同期は Phase 4 ではなく Phase 2 で導入 |
| **D4** | **自動車ローン・カメラローンの2件を Phase 2 に前倒し**。住宅ローンは固定金利・変動なしのため「固定費」として登録するだけで完結し、独立したローン管理機能は最小限 | PdM §Phase3 のローン機能を Phase 2 へ。住宅ローンは `RecurringFixed` で表現、ボーナス加算 UI は不要にしてシンプル化 |

### 1.3 Phase 別の概要

| Phase | 期間目安 | ゴール | 中核機能 |
|---|---|---|---|
| **Phase 1** | 2026-05〜06上旬 | 自分用 MVP。トップ画面の作り直し | 4請求グループ管理、カード管理、締め日サイクル集計、翌月差分ダッシュボード、月収設定 |
| **Phase 2** | 2026-06中〜07 | マルチデバイス同期＋ローン2件＋銀行 CSV 着手 | **Supabase 導入（同期の中核）**、ローン2件（自動車・カメラ）、住宅ローンは固定費登録 |
| **Phase 3** | 2026-08 | 固定費自動検出＋ボーナス＋12ヶ月ビュー | 銀行 CSV 取込、固定費自動抽出、ボーナス加算、12ヶ月キャッシュフロー |
| **Phase 4** | 2026-Q4〜 | 公開（SaaS化） | マルチテナント本格化、APIキー保管再設計、課金、認証強化、外部ペンテスト |

---

## 2. 製品要件

### 2.1 ターゲットユーザー

- **プライマリー**: クレジットカードを生活インフラとして複数枚利用する社会人。月収固定、ローン1件以上、紙の家計簿で挫折した層
- **ペルソナ（社長 = ファーストユーザー）**: 40代男性、給与＋ボーナス、住宅ローンあり、メインカード4系統、痛みは「来月の引落集中で給料日前に残高が薄い」
- **セカンダリー（Phase 4以降）**: 同じ痛みを持つ20〜50代の生活者全般（SaaS化）

### 2.2 コアジョブ（Jobs to be Done）

| When | I want to | So I can |
|---|---|---|
| 朝コーヒーを飲みながらアプリを開いた時 | 翌月の引落合計と収入の差分を一目で見たい | 今日カードを切ってよいか判断できる |
| 銀行 CSV をダウンロードした時 | 固定費を自動で識別してほしい | 手入力の手間なく予測精度を上げたい |
| ボーナス月が近づいた時 | 加算ローン込みの引落予測を見たい | ボーナスを使い切る前に余力を計算できる |
| 新しいカードを作った時 | 締め日・引落日・所属請求グループを登録したい | 4グループのキャッシュフローに即反映したい |
| 別端末で開いた時 | 同じデータが見えてほしい（**D3 反映**） | スマホでも PC でも同じ判断ができる |

**非ジョブ（やらないこと）**

- 食費が今月いくらかを知る／カテゴリ別節約アドバイス
- レシート1枚ごとの記録（カード明細で代替）
- 横断 ML 学習による「全国版固定費辞書」の構築（**D3**）

### 2.3 機能要件（Phase別）

#### Phase 1（自分用 MVP・3〜4週間）

- **1.1 請求グループ管理**: PayPay / セゾン / イオン / JCB の4グループを初期投入。締め日・引落日を保持・編集可能。
- **1.2 カード管理**: カード単位で `名前 / 所属請求グループID / カードマスタID(任意)` を持つ。「ニコス」→ JCB グループ、「ビックカメラ Suica」→ JCB グループのような紐付け。
- **1.3 締め日ベース集計（コアロジック）**: `aggregateByBillingCycle(groupId, cycleAnchor)` を新設。
- **1.4 翌月引落 vs 収入ダッシュボード（新トップ画面）**: 大見出し「翌月の差分: +¥XX,XXX」、4グループ内訳、3ヶ月タイムライン。
- **1.5 取引入力**: `cardId` フィールドを追加、カード未指定の現金取引も許容。**カード選択を必須化**（UI §4 反映）。
- **1.6 月収設定**: 月収（手取り）を1フィールド追加。

#### Phase 2（前倒しマージ・2〜3週間）— **D3, D4 反映**

- **2.1 Supabase 導入＋マルチデバイス同期（中核）**: localStorage を Source of Truth から外し、Supabase Postgres + RLS をマスタにする。オフライン編集→再接続同期。
- **2.2 ローン管理（自動車ローン・カメラローン）**: 2件のみ Phase 2 で実装。`name / monthly / bonus_addon / bonus_months / start / end` を持つ。住宅ローンは独立 UI を持たず固定費として登録。
- **2.3 認証**: Magic Link（Supabase Auth）。Phase 2 はベータ用に最低限。
- **2.4 銀行 CSV 取込（基盤のみ）**: パース＋取込のみ。固定費自動検出は Phase 3。

#### Phase 3（2〜3週間）

- **3.1 固定費自動検出**: 銀行 CSV から「同一摘要 × 月1回 × 金額±10% × 3〜6ヶ月連続」のクラスタを抽出（Data/ML §1）。
- **3.2 ボーナス収入**: 年2回（6月/12月などユーザー指定）、各回の手取り見込み額。
- **3.3 12ヶ月キャッシュフロービュー**: 当月〜12ヶ月先までを棒グラフ、赤字月をハイライト。

#### Phase 4（中長期）— SaaS 公開

- マルチテナント本格化、課金（Stripe）、**APIキー保管の再設計**（D2）、認証強化（MFA・Argon2id）、外部ペンテスト、コンプライアンス。

### 2.4 非機能要件

| 項目 | 要件 |
|---|---|
| パフォーマンス | ダッシュボード初回描画 < 1秒（取引1万件まで） |
| データ保持 | Phase 1: localStorage / Phase 2〜3: Supabase + ローカルキャッシュ / Phase 4: 暗号化強化 |
| ブラウザ対応 | Chrome / Safari / Firefox 最新、モバイルレスポンシブ（375px ファーストビュー対応） |
| データエクスポート | JSON / CSV を全 Phase で維持 |
| プライバシー | API key・取引データは外部送信しない（横断学習 **D3 不採用**） |
| エラー耐性 | CSV 取込失敗時に部分ロールバック、データ破損ゼロ |
| UI 言語 | 日本語のみ（Phase 4 で多言語検討） |

### 2.5 KPI

- **Phase 1 North Star**: 社長が毎朝アプリを開く（週5日以上 / 4週連続）
- 翌月差分の予測誤差 ≤ ±5%（Phase 1）、±10%（ボーナス月含む Phase 3）
- 自動検出固定費のユーザー承認率 ≥ 70%（Phase 3）
- Phase 4 SaaS: 7日継続率 ≥ 40%、有料転換率 ≥ 5%

---

## 3. 画面設計の要点

> UI Designer 文書から本書必要分を抜粋。決定の影響箇所は **【決定反映】** で明示。

### 3.1 新画面構成（5タブ + 設定階層）

```
/                       トップ（請求カレンダー＋黒字赤字）
/cards                  カード & 請求グループ管理
/add                    取引入力（カード選択必須）
/transactions           取引一覧（カード・グループでフィルタ）
/import                 銀行/カードCSV取込（Phase 2基盤・Phase 3で固定費自動検出）
/settings               設定
  ├ /settings/groups    請求グループ（締め日・引落日）
  ├ /settings/loans     ローン（自動車・カメラのみ Phase 2）【D4反映】
  ├ /settings/fixed     固定費（住宅ローンはここに登録）【D4反映】
  ├ /settings/budget    カテゴリ予算（オプション・降格）
  ├ /settings/rules     カテゴリ自動分類ルール
  └ /settings/data      エクスポート・インポート・同期【Phase 2でD3反映】
```

### 3.2 トップページの優先順位（375px ファーストビュー）

1. 月セレクタ（現在月 / 翌月切替）
2. **「翌月引落予定」金額**（最大サイズ・40px Bold）
3. **収入との差額＋黒字/ギリギリ/赤字バッジ**
4. 直近1件の引落予定

その下に：引落カレンダー → 4グループ別内訳 → ローン → 折りたたみのカテゴリ別。

### 3.3 黒字/赤字バッジの状態定義（FP §2.3 と整合）

| 差額 | UI ラベル | 色 | 内部条件 |
|---|---|---|---|
| 可処分余力(M) ≥ 0 かつ 引落 ≤ 収入×0.85 | **黒字** | green `#1A6B4A` | FP §2.3 緑 |
| 上記未満〜安全余裕内 | **ギリギリ** | amber `#E5972A` | FP §2.3 黄 |
| 可処分余力(M) < -安全余裕(M) | **赤字** | red `#C0392B` | FP §2.3 赤 |

### 3.4 取引入力 — カード選択必須

- **カードを選ばないと「保存」ボタンがアクティブにならない**（UI §4）
- 直前のカード（`lastUsedCardId`）を初期選択するが、ユーザー明示選択フラグは別管理
- 「現金」も選択肢の1つ（請求グループ非所属、当月キャッシュフロー即計上）

### 3.5 デザイン原則

- 数字は主役（最重要 32–40px Bold、説明 12–14px Regular）
- 角丸 16px (`rounded-2xl`)、影は `shadow-sm` のみ
- 信号色は3色まで（accent green / amber / red）
- アクセシビリティ：色＋アイコン＋ラベルの三重符号化、WCAG AA 4.5:1、`tabular-nums` で金額揃え

### 3.6 BottomNav

5タブ：🏠 ホーム / 💳 カード / **＋ 追加（中央 FAB）** / 📋 取引 / ⚙ 設定。Import は BottomNav から外し、ホーム上部の月セレクタ右隣に「📥 取込」アイコン。

### 3.7 【決定反映】箇所サマリー

- **D3**: `/settings/data` に「同期 ON/OFF」「ログイン状態」「最終同期日時」を追加（Phase 2）。
- **D4**: `/settings/loans` は自動車・カメラの2件のみ。`/settings/fixed` に住宅ローンを誘導するヒント文を表示。
- **D2**: API キー入力欄は Phase 1〜3 で localStorage 平文保存のまま据え置き（公開しないため）。Phase 4 で UI を含めて再設計。
- **D1**: 通貨ラッパー型（`Money`）は導入しない。すべて `number`（整数）で保持し、表示時に `Intl.NumberFormat('ja-JP')` でフォーマット。

---

## 4. アーキテクチャ（Phase別進化）

### 4.1 Phase 1: localStorage 完結（自分用 MVP）

**ゴール:** バックエンド費用ゼロのまま社長 1 人で動かす。

- 現行の React + TypeScript + Vite + Zustand + Tailwind を継続
- ホスティング: GitHub Pages 継続（Phase 2 で Cloudflare Pages 移行）
- データ: **localStorage のみ**（IndexedDB 移行も Phase 2 まで延期。理由: 単端末・自分用なので容量・差分同期は不要）
- API キー: **localStorage 平文継続（D2）**
- レシート OCR: ユーザー自前の Anthropic API キー、`anthropic-dangerous-direct-browser-calls: true` は Phase 4 まで継続

**やらないこと:** 認証・サーバー・暗号化・マルチテナント・IndexedDB 移行

### 4.2 Phase 2: Supabase 導入＋マルチデバイス同期＋ローン2件追加 — **D3, D4 中核**

**ゴール:** 社長がスマホ・PC・タブレットの間でデータを共有でき、自動車ローン・カメラローンを追加して引落予測の網羅性を上げる。

#### 4.2.1 採用スタック

| レイヤ | 採用 | 理由 |
|---|---|---|
| フロント配信 | **Cloudflare Pages**（GitHub Pages から移行） | 国内エッジ・無料枠厚い・Workers と統合 |
| 認証・DB・Storage | **Supabase（Tokyo region / ap-northeast-1）** | Postgres + RLS でテナント分離を SQL 層で強制 |
| 軽量 API | **Supabase クライアント直叩き（PostgREST）** | RLS 済み、フロントから直接、`supabase gen types` で型安全 |
| 同期戦略 | **Last-Write-Wins + `updated_at` 比較** | 単一ユーザーの複数端末なので競合は希少。Phase 4 で本格的な CRDT を再評価 |

**Vercel/AWS フルスタック不採用の理由:** Vercel は Postgres 日本リージョン弱・cold start の問題。AWS フルは 1000人規模で月 $200〜と過剰、RLS 相当を自前で書くコスト高（Cloud §1.2 と一致）。

#### 4.2.2 同期モデル

```
[Browser]            [Supabase]
zustand store ─┬─→  Postgres (Source of Truth)
               │     RLS: user_id = auth.uid()
localStorage ──┤  ←─ realtime subscription（変更通知）
(オフライン   │
 キャッシュ)  │
               └─→ オフライン編集は queue → 再接続時 flush
```

- 起動時: Supabase から最新を取得 → localStorage に書き戻し → Zustand へ
- 編集時: Zustand 更新 → localStorage 即時保存 → Supabase へ非同期 push
- オフライン時: localStorage のみで動作、`pending_sync` flag を立てる
- 再接続時: `updated_at` の新しい方を採用（LWW）

#### 4.2.3 認証

- **Magic Link（メール）** をデフォルト（Cloud §4 と一致）
- パスワード認証は提供しない
- Phase 2 は社長 1 人＋ベータ数名なので 2FA は任意
- セッション: Supabase Auth JWT、アクセス 1h / リフレッシュ 30d

#### 4.2.4 ローン2件追加（D4）

- `/settings/loans` で自動車ローン・カメラローンの2件を登録
- 住宅ローンは独立 UI を持たず、`/settings/fixed` で「住宅ローン」という名前の固定費として登録（金額固定、月次引落のみ）
- これにより Loan エンティティのボーナス加算・繰上返済・残債管理は Phase 2 では不要、最小実装で完結

### 4.3 Phase 3: 銀行 CSV 検出＋12ヶ月ビュー

- 銀行 CSV パーサ（Data/ML §2 のスキーマ自動判別を採用、ただし学習・集約は **しない**）
- 固定費自動検出（Data/ML §1、ローカル完結）
- ボーナス収入モデル
- 12ヶ月キャッシュフロー棒グラフ

**サーバー側の追加:** 銀行 CSV の Storage 保管はオプション（プライバシー重視でクライアント完結が既定）。

### 4.4 Phase 4: 公開・APIキー保管再設計（D2）

**ゴール:** 社長以外のユーザーに開放。

- **マルチテナント本格化**: `users` / 将来 `organizations`（家族プラン）
- **API キー保管再設計（D2）**:
  - 方針 A（推奨）: kakebo がサービス所有のキーで提供。ユーザーは入力不要。Cloudflare Workers 経由で Anthropic を叩き、`anthropic-dangerous-direct-browser-calls` を **削除**
  - 方針 B（BYOK 残す場合）: サーバー側でエンベロープ暗号化（AES-256-GCM + KMS KEK）して DB 保存
- **認証強化**: Argon2id、MFA（TOTP）、HIBP 漏洩 PW 拒否、CSP 全面適用
- **暗号化**: フィールドレベル暗号化（金額・摘要・銀行情報）、pgcrypto + KMS
- **コンプライアンス**: 個人情報保護法、PCI DSS（SAQ-A 範囲、Stripe 委譲）、外部ペンテスト
- **課金**: Stripe（Cloud §2 のスタックに準拠）

詳細は §6（セキュリティ Phase 別）参照。

### 4.5 観測性・CI/CD（Phase 2 以降）

- エラートラッキング: Sentry（フロント＋ Workers）
- ログ: Supabase Log Drains
- CI: GitHub Actions（lint / typecheck / vitest / playwright smoke）
- DB migration: `supabase migration` で SQL ファイル管理、本番適用は手動承認

---

## 5. 計算ロジック仕様

> FP 文書を中核として採用。決定の影響箇所は明示。

### 5.1 用語

| 概念 | 定義 |
|---|---|
| `BillingGroup` | 請求グループ（PayPay / セゾン / イオン / JCB）。`closing_day` と `withdrawal_rule` を持つ |
| `Card` | カード。`billing_group_id` を1つ持つ |
| `Transaction` | カード利用1件。`card_id`, `used_at`, `amount`（**number 整数 / D1**） |
| `BillingCycle` | 1請求サイクル。`group_id`, `period_start`, `period_end`, `withdrawal_date`, `total_amount` |
| `Loan` | ローン。`monthly`, `bonus_addon`, `bonus_months`, `withdrawal_day`（自動車・カメラのみ / D4） |
| `RecurringFixed` | 固定費。住宅ローン・家賃・サブスク等（D4 で住宅ローンを集約） |
| `Income` | 収入。`monthly_take_home`, `bonus_amount`, `bonus_months` |
| `SafetyBuffer` | 安全余裕（既定: 月収の5%、最低1万円） |

すべての金額は **円・整数（number 型 / D1）**、日付は **JST のローカル日付**。

### 5.2 締め日・引落日の計算

```typescript
type BillingGroup = {
  closing_day: number | "EOM"           // 1〜31 or 末日
  withdrawal_offset_months: number      // 締め月から何ヶ月後（多くは 1）
  withdrawal_day: number | "EOM"
  closing_holiday_policy: "shift_back" | "as_is"   // 既定: as_is
  withdrawal_holiday_policy: "next_business_day"   // 引落は翌営業日
}
```

**実務慣習:**
- 締め日は日付ベース（土日祝でも当日締め）が既定。グループ単位で `shift_back` 設定可。
- 引落日は土日祝にあたる場合 **翌営業日に倒す**（日本の銀行振替の標準）。
- `closing_day = "EOM"` / `withdrawal_day = "EOM"` を許容。
- 振替休日にも対応（5/3 が日曜なら 5/6 が振替休日 → 5/7 へ）。

**典型例（5/15 締め 6/27 引落のグループに 5/20 利用）:**
- 5月締め日 = 5/15、5/20 は超えているので 5月サイクルに入らない
- 次の締め = 6/15 → 5/20 は (5/16〜6/15) サイクルに帰属
- 引落 = 7/27（6/15 締めの翌月27日）

**4グループ既定値（FP §1.4）:**

| グループ | 締め日 | 引落日 | offset |
|---|---|---|---|
| PayPay | 月末 | 翌月27日 | +1 |
| セゾン | 10日 | 翌月4日 | +1 |
| イオン | 10日 | 翌月2日 | +1 |
| JCB | 15日 | 翌月10日 | +1 |

ユーザーが個別上書き可。

### 5.3 「翌月赤字」KPI

```
予測引落合計(M) = Σ(BillingCycle.total) where withdrawal in M
                 + Σ(Loan.amount_for_month(M))   // 自動車・カメラのみ（D4）
                 + Σ(RecurringFixed.amount in M) // 住宅ローン含む（D4）

予測収入(M)     = monthly_take_home + (bonus if M in bonus_months else 0)

貯蓄目標(M)     = saving_goal_monthly + (bonus_saving_goal if M in bonus_months else 0)

安全余裕(M)     = max(monthly_take_home * 0.05, 10_000)

可処分余力(M)   = 予測収入(M) - 予測引落合計(M) - 貯蓄目標(M) - 安全余裕(M)
```

**信号色閾値:**
- 緑: `可処分余力 ≥ 0` かつ `引落 ≤ 収入 × 0.85`
- 黄: 上記未満〜安全余裕の範囲
- 赤: `可処分余力 < -安全余裕`

### 5.4 ローンのボーナス加算（D4 で2件のみ）

```typescript
function loanAmountForMonth(loan: Loan, year: number, month: number): number {
  if (!inRange(loan, year, month)) return 0
  const base = loan.monthly_amount
  const addon = loan.bonus_months.includes(month) ? loan.bonus_addon : 0
  return base + addon
}
```

UI 上「30,000 + ボーナス加算 100,000 = 130,000」と分解表示。住宅ローンは固定金利・変動なしのため `RecurringFixed` で十分（Loan エンティティを使わない）。

### 5.5 「あといくら使えるか」（当月安全使用可能額）

```
safe_daily_budget(today) = (
    予測収入(M_now)
  − 既確定出金(M_now, until=today)
  − 翌月引落予定の積み増し分(M_now+1)   // 当月利用が翌月に引落になる分
  − 貯蓄目標(M_now)
  − 安全余裕(M_now)
) ÷ 残日数(today, end_of_month)
```

「当月の収入で来月の引落を賄う」原則。当月利用分は来月引落だが、当月のうちに収入から取り置く前提。

### 5.6 実装上の注意（FP §8 抜粋）

1. **タイムゾーン一貫性**: すべて JST、`new Date('2026-05-15')` の UTC 解釈に注意。
2. **祝日マスタ**: `jpholiday` 相当のテーブルを内蔵、年1回更新。
3. **BillingCycle の冪等再計算**: 過去確定済みは `is_finalized=true` で凍結。
4. **未来予測は3ヶ月先まで**（12ヶ月ビューは Phase 3 で別概念）。
5. **金額は number 整数（D1）**: `Math.round` を計算経路の最終段階で1回だけ使う。中間結果に小数を残さない。

### 5.7 通貨ライブラリ非採用（D1 補足）

- **dinero.js / decimal.js は不採用**
- 理由: 日本円のみで最小単位＝1円。整数演算で誤差ゼロが成立。ライブラリ依存・学習コストを排除。
- 代替策: バリデーションで `Number.isInteger(amount) && Number.isFinite(amount)` を強制。`zod` で `z.number().int().finite().safe()` を全エンドポイントに適用。
- 表示は `Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' })`。

---

## 6. セキュリティ要件（Phase別）

> Security 文書の Must / Should / Nice を Phase に再マッピング。**D2 により Phase 1 は最小限**、Phase 4 で本格適用。

### 6.1 Phase 1（自分用・社内のみ）

| 要件 | 対応 |
|---|---|
| API キー保管 | **localStorage 平文継続（D2）**。自分用のため許容 |
| HTTPS | GitHub Pages の標準 HTTPS で十分 |
| データ暗号化 | 不要（自分の端末のみ） |
| CSP | 設定推奨だが必須化はしない |
| 認証 | なし（自分用） |

**やらないこと:** バックエンドプロキシ化、Argon2id、MFA、ペンテスト、CSP の本格適用、依存ライブラリ自動監視。

### 6.2 Phase 2（マルチデバイス同期＋ベータ数名）

| 要件 | 対応 |
|---|---|
| Supabase 認証 | Magic Link（パスワードレス） |
| RLS | 全主要テーブルで `user_id = auth.uid()` を強制 |
| TLS | Cloudflare Pages + Supabase で自動 1.3 |
| データ at-rest | Supabase デフォルトの AES-256 ディスク暗号化のみ（FLE は Phase 4） |
| API キー | **依然 localStorage 継続（D2）**。Phase 4 で再設計するまで据え置き |
| CSV インポート | 先頭文字 `=`, `+`, `-`, `@` のエスケープ追加 |

### 6.3 Phase 3（固定費検出・ベータ拡大）

- Sentry 導入（PII スクラビング有り）
- Dependabot / `npm audit` を CI に追加
- HSTS / X-Frame-Options / X-Content-Type-Options
- 金額・摘要のログ送信を禁止（Sentry のスクラビングルールで除外）

### 6.4 Phase 4（公開・SaaS 化）— Security 文書の Must を本格適用

- **API キー保管再設計（D2 の Phase 4 適用）**:
  - 方針 A（推奨）: サービス所有キーをサーバー保管、Workers 経由
  - 方針 B（BYOK）: サーバー側エンベロープ暗号化（AES-256-GCM + KMS）
  - `anthropic-dangerous-direct-browser-calls` 削除
- 認証強化: Argon2id（パスワード提供時）、MFA（TOTP）、WebAuthn（Should）
- フィールドレベル暗号化: `transactions.amount` / `transactions.merchant` / `loans.*` / `incomes.*` を pgcrypto AEAD で暗号化、KEK は KMS / Supabase Vault
- CSP 完全版（Security §4.2）
- 外部ペンテスト（GA 前 Must）
- コンプライアンス: 個人情報保護法、PCI DSS SAQ-A、電気通信事業法外部送信規律
- インシデント対応計画（IR）の整備、漏えい時の個人情報保護委員会報告フロー
- Stripe による決済委譲（PCI 範囲縮小）

### 6.5 Phase ごとの Must チェックリスト

```
Phase 1: [x] HTTPS / [x] エクスポート機能
Phase 2: [ ] Supabase RLS 全テーブル / [ ] Magic Link / [ ] 単体ログ PII 除外
Phase 3: [ ] Dependabot / [ ] npm audit CI / [ ] HSTS / [ ] CSV インジェクション対策
Phase 4: Security 文書の付録 A 全項目（APIキー再設計、Argon2id、MFA、FLE、ペンテスト、IR、コンプライアンス）
```

---

## 7. データ・自動化機能

> Data/ML 文書から Phase 別に再構成。**横断学習（D3）は不採用**。

### 7.1 採用する自動化

| 機能 | Phase | 概要 |
|---|---|---|
| 銀行 CSV 様式自動判別 | Phase 2基盤 / Phase 3で実用 | 列名エイリアス辞書、文字コード自動判定（UTF-8 / SJIS / CP932）、日付フォーマット推定（和暦含む） |
| 固定費自動検出 | Phase 3 | 「同一摘要 × 月1回 × 金額±10% × 3〜6ヶ月連続」のクラスタリング、信頼度スコア ≥ 0.6 で候補提示 |
| カテゴリ自動分類 | Phase 3〜（オプション） | キーワード辞書方式（Phase 1相当）。**埋め込み類似度・per-user fine-tune は不採用** |
| レシート OCR | Phase 1 残置（既存）／ Phase 4 で再設計 | Claude Vision、Phase 4 で Workers 経由に移行 |
| 異常検知 | Phase 3以降の Should | 移動平均±2σ、Isolation Forest は不採用（複雑すぎ） |

### 7.2 横断学習（D3 で不採用）

**Data/ML §6.2 / §7（BigQuery 集約辞書、k-匿名性、オプトイン共有プール）は全面不採用。**

理由:
- 真のニーズはマルチデバイス同期（D3）であり、横断学習による精度向上ではない
- 自分用＋少数ベータでは学習データの母数が足りず、k-匿名性 50 を満たせない
- プライバシーリスクと運用コストが利益を上回る

採用する代替: **per-user 訂正の即時反映のみ**。ユーザー単位の `category_feedback` は localStorage / Supabase に保存し、当該ユーザーの分類器のみ更新する。サーバー側集約・Edge config 配布はしない。

### 7.3 摘要正規化（Data/ML §1.5 採用）

```typescript
function normalizeDescription(s: string): string {
  s = s.normalize('NFKC').toUpperCase()
  s = s.replace(DATE_NOISE_RE, ' ')
  s = s.replace(SEQUENCE_RE, ' ')
  s = s.replace(/[（）()【】\[\]・.\-_/]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/\s\d+店?$/, '')
  return s
}
```

固定費判定の二重計上を防ぐため、`EXCLUDE_KEYWORDS`（カード会社・振込手数料・自動振替）を除外。

### 7.4 銀行 CSV パース（Data/ML §2 採用）

- 列名エイリアス辞書（`COLUMN_ALIASES`）で論理カラムにマッピング
- 入出金1カラム / 2カラム の自動判別
- 文字コード: BOM 確認 → UTF-8 厳格デコード → CP932 フォールバック
- 日付: ISO 系 / 和暦 / `%Y%m%d` などを多数決投票で確定

### 7.5 レシート OCR（既存実装の維持）

- Phase 1〜3: ユーザー自前の Anthropic API キー＋ブラウザ直叩き継続（D2）
- Phase 4: Workers 経由のサーバー所有キー方式に移行
- プロンプト: Data/ML §4.3 のスキーマで構造化 JSON 出力

---

## 8. 品質保証

> QA 文書を採用、ただし **D1（通貨ライブラリ不採用）** で 7.2 を上書き。

### 8.1 黄金律

**「金額が1円でも合わなかったら不合格」**。表示金額は `toBe(整数値)` で厳密一致、`toBeCloseTo` 禁止。

### 8.2 テストピラミッド

- Unit 70%（Vitest、金額・日付ロジックの大半）
- Integration 25%（Vitest + Testing Library + msw、Supabase 同期は msw でモック）
- E2E 5%（Playwright、クリティカルフロー10〜15シナリオ）

### 8.3 カバレッジ目標

| 種別 | 目標 |
|---|---|
| Statements | 80% |
| Branches | 85%（金額・日付ロジックは100%） |
| 金額計算モジュール | **100%（必須）** |

### 8.4 通貨ライブラリ非採用（D1）— QA §7.2 の上書き

QA は dinero.js v2 を第一候補として推奨していたが、**社長決定により不採用**。

- **理由**: 日本円のみ、最小単位＝1円なので整数演算で誤差ゼロ。`number` 型で `Number.MAX_SAFE_INTEGER`（≒9007兆）まで安全に保持できる。家計簿用途では最大想定額（10億）を遥かに上回る余裕。
- **代替策（必須）**:
  1. **境界での整数バリデーション**: 全入力点（フォーム・CSV パース・API レスポンス）で `Number.isInteger(amount) && Number.isFinite(amount)` を強制。`zod` の `z.number().int().finite().safe()` をスキーマで全面適用。
  2. **計算規則の固定**: 除算・乗算で小数が生じる場合、計算経路の **最終段階で 1 回だけ** `Math.round` を呼ぶ。中間に小数を残さない。
  3. **三経路一致テスト**: `sum(transactions) === monthlyTotal === sum(group.total for all groups)` を不変条件として全テストで検証（QA §7.3 維持）。
  4. **fast-check プロパティテスト**: 整数加算・按分（端数を最終回に寄せる）に対し、ランダム配列で合計不変を検証。
  5. **ローン按分の端数寄せ**: `33,333 + 33,333 + 33,334` のように端数を最終回に寄せる関数を共通化（CR-50 を満たす）。

### 8.5 必須回帰テスト（QA §6 の50ケースを採用）

- 金額計算 20件（CR-50〜53、EG-01〜05、ローン按分、月次合計＝明細合計）
- 締め日／引落日 15件（CR-01〜04、CR-10〜14、CR-20〜22、CR-30〜32）
- CSV 取込 8件（EG-10〜16）
- データ整合性 5件（DI-01, 03, 04, 05, 06）
- UI 致命傷 2件

### 8.6 自動化ロードマップ

- Phase 1: 50 ケース手動チェックリスト
- Phase 2: Vitest 導入、金額・締め日モジュール 100% 化、PR ごと CI
- Phase 3: Playwright 導入、E2E 40ケース自動化
- Phase 4: ミューテーションテスト（Stryker）、本番ログから逆流テスト追加

### 8.7 バグ Severity

S1（金額誤表示・データロス）は条件問わず最低 P1、全ユーザー影響なら P0。**この基準は不変。**

---

## 9. データモデル統合版

> 7名の提案を統合し、Phase 1 の TypeScript 型と Phase 2 の Postgres スキーマを示す。**整数（円）は number 型で保持（D1）**。

### 9.1 TypeScript 型（Phase 1 / クライアント）

```typescript
// 4請求グループ
type BillingGroup = {
  id: string
  name: string                          // PayPay / セゾン / イオン / JCB
  closing_day: number | 'EOM'           // 1〜31 or 末日
  withdrawal_offset_months: number      // 多くは 1
  withdrawal_day: number | 'EOM'
  closing_holiday_policy: 'shift_back' | 'as_is'   // 既定 'as_is'
  withdrawal_holiday_policy: 'next_business_day'   // 既定
  account_label?: string                // 表示用 "三井住友 ****1234"
  created_at: string                    // ISO
  updated_at: string                    // 同期用（D3）
}

// カードマスタ（カード会社の既定値辞書）
type CardMaster = {
  id: string
  brand: string                         // セゾン / イオン / JCB / 三井住友 / 楽天 / アメックス
  default_closing_day: number | 'EOM'
  default_withdrawal_day: number | 'EOM'
  default_offset_months: number
}

// カード
type Card = {
  id: string
  name: string                          // 例: ニコスゴールド
  billing_group_id: string              // 4グループのいずれか
  card_master_id?: string               // 任意
  last4?: string
  color?: string
  created_at: string
  updated_at: string
}

// 取引
type Transaction = {
  id: string
  card_id?: string                      // 現金は undefined
  occurred_on: string                   // YYYY-MM-DD（JST）
  amount: number                        // 整数・円（D1）
  category?: string
  merchant?: string
  memo?: string
  source: 'manual' | 'csv' | 'ocr'
  source_ref?: string                   // 重複防止
  created_at: string
  updated_at: string
}

// ローン（自動車・カメラのみ Phase 2 / D4）
type Loan = {
  id: string
  name: string                          // "自動車ローン" or "カメラローン"
  monthly_amount: number                // 整数・円
  bonus_addon: number                   // ボーナス加算額（無ければ 0）
  bonus_months: number[]                // [6, 12] 等
  withdrawal_day: number                // 1〜31
  start_month: string                   // YYYY-MM
  end_month?: string                    // YYYY-MM、未定なら undefined
  created_at: string
  updated_at: string
}

// 固定費（住宅ローン含む / D4）
type RecurringFixed = {
  id: string
  name: string                          // 例: "住宅ローン" / "家賃" / "Netflix"
  amount: number                        // 整数・円
  withdrawal_day: number                // 1〜31
  start_month: string
  end_month?: string
  source: 'manual' | 'csv_detected'     // Phase 3 で csv_detected
  created_at: string
  updated_at: string
}

// 収入
type Income = {
  monthly_take_home: number             // 整数・円
  bonus_amount: number                  // 1回あたり手取り（Phase 3）
  bonus_months: number[]                // Phase 3
  input_mode: 'take_home' | 'gross'     // 既定 take_home
  updated_at: string
}

// 設定
type Settings = {
  income: Income
  saving_goal_monthly: number
  bonus_saving_goal: number
  safety_buffer_override?: number
  last_used_card_id?: string
  anthropic_api_key?: string            // localStorage 平文（Phase 1〜3 / D2）
  sync_enabled: boolean                 // Phase 2（D3）
}
```

### 9.2 Postgres スキーマ（Phase 2）

Cloud §3 をベースに **D1（通貨）と D4（ローン2件＋住宅ローンを RecurringFixed）を反映**。

```sql
-- ユーザー
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  locale text default 'ja-JP',
  timezone text default 'Asia/Tokyo',
  plan text default 'free',
  stripe_customer_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- 請求グループ
create table billing_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  closing_day_spec text not null,        -- '1'〜'31' or 'EOM'
  withdrawal_day_spec text not null,
  withdrawal_offset_months smallint not null default 1,
  closing_holiday_policy text not null default 'as_is',
  withdrawal_holiday_policy text not null default 'next_business_day',
  account_label text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- カードマスタ（マスタはアプリ配布、user_id 不要）
create table card_masters (
  id uuid primary key default gen_random_uuid(),
  brand text not null unique,
  default_closing_day_spec text not null,
  default_withdrawal_day_spec text not null,
  default_offset_months smallint not null default 1
);

-- カード
create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  billing_group_id uuid not null references billing_groups(id),
  card_master_id uuid references card_masters(id),
  display_name text not null,
  last4 text,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 取引（amount は bigint だが D1 で正整数のみ受付）
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid references cards(id),    -- 現金は null
  occurred_on date not null,
  amount_jpy bigint not null check (amount_jpy >= 0 or amount_jpy < 0),
  category text,
  merchant text,
  memo text,
  source text not null check (source in ('manual','csv','ocr')),
  source_ref text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on transactions (user_id, occurred_on desc);
create unique index on transactions (user_id, source, source_ref) where source_ref is not null;

-- ローン（自動車・カメラの2件 / D4）
create table loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,                   -- '自動車ローン' or 'カメラローン'
  monthly_amount_jpy bigint not null,
  bonus_addon_jpy bigint not null default 0,
  bonus_months smallint[] not null default '{}',
  withdrawal_day smallint not null,
  start_month date not null,
  end_month date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 固定費（住宅ローン含む / D4）
create table recurring_fixed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,                   -- '住宅ローン' / '家賃' / 'Netflix' 等
  amount_jpy bigint not null,
  withdrawal_day smallint not null,
  start_month date not null,
  end_month date,
  source text not null default 'manual' check (source in ('manual','csv_detected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 収入（user 1件・upsert）
create table incomes (
  user_id uuid primary key references users(id) on delete cascade,
  monthly_take_home_jpy bigint not null,
  bonus_amount_jpy bigint not null default 0,
  bonus_months smallint[] not null default '{}',
  input_mode text not null default 'take_home',
  saving_goal_monthly_jpy bigint not null default 0,
  bonus_saving_goal_jpy bigint not null default 0,
  safety_buffer_override_jpy bigint,
  updated_at timestamptz default now()
);

-- 同期用：単一 user_settings
create table user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  last_used_card_id uuid references cards(id),
  sync_enabled boolean not null default true,
  updated_at timestamptz default now()
);
```

### 9.3 RLS（Phase 2 必須）

```sql
alter table billing_groups enable row level security;
create policy bg_owner on billing_groups using (user_id = auth.uid()) with check (user_id = auth.uid());

-- cards / transactions / loans / recurring_fixed / incomes / user_settings に同型のポリシーを適用
```

### 9.4 同期戦略（D3）

- `updated_at` を全テーブルに付与
- Last-Write-Wins: クライアント・サーバーで `updated_at` の新しい方を採用
- 削除は論理削除（`deleted_at`）で同期競合を回避

### 9.5 4請求グループ初期投入

```typescript
const INITIAL_GROUPS: BillingGroup[] = [
  { id: '...', name: 'PayPay',  closing_day: 'EOM', withdrawal_day: 27, ... },
  { id: '...', name: 'セゾン',   closing_day: 10,    withdrawal_day: 4,  ... },
  { id: '...', name: 'イオン',   closing_day: 10,    withdrawal_day: 2,  ... },
  { id: '...', name: 'JCB',     closing_day: 15,    withdrawal_day: 10, ... },
]
```

---

## 10. 段階的ロードマップ

### 10.1 時系列マイルストーン

| 時期 | フェーズ | 主要マイルストーン | 依存 |
|---|---|---|---|
| 2026-05 | Phase 1 着手 | 型定義・store 刷新、`BillingGroup`/`Card`/`Loan`/`RecurringFixed` 追加、`billingCycle.ts`/`forecast.ts` 実装 | — |
| 2026-05 中旬 | Phase 1 中盤 | カード管理画面（`/cards`）、取引入力画面のカード選択必須化 | 型定義 |
| 2026-06 上旬 | Phase 1 完了 | 新ダッシュボード（翌月差分）、4グループ内訳、引落カレンダー、社長ドッグフーディング開始 | 上記すべて |
| 2026-06 中旬 | Phase 2 着手 | **Supabase プロジェクト立上げ（Tokyo）**、スキーマ migration、Magic Link 認証、Cloudflare Pages 移行 | Phase 1 完了 |
| 2026-06 下旬 | Phase 2 中核 | **同期レイヤ実装**（zustand → Supabase）、オフライン編集キュー、ローン2件追加 UI（自動車・カメラ）、住宅ローンを `RecurringFixed` で登録誘導 | Supabase 立上げ |
| 2026-07 上旬 | Phase 2 完了 | マルチデバイス同期動作確認（社長 PC/スマホ）、銀行 CSV パース基盤（取込のみ、検出なし） | 同期完了 |
| 2026-07 中旬 | Phase 3 着手 | 固定費自動検出アルゴリズム、銀行 CSV スキーマ自動判別、ボーナス収入入力 | Phase 2 完了 |
| 2026-08 中旬 | Phase 3 完了 | 12ヶ月キャッシュフロービュー、固定費承認 UI、Sentry / Dependabot 導入 | 検出アルゴリズム |
| 2026-09〜 | Phase 4 検討 | API キー保管再設計（D2）、認証強化（Argon2id/MFA）、FLE、外部ペンテスト準備 | Phase 3 安定 |
| 2026-Q4 | Phase 4 ベータ | クローズドベータ（Stripe・課金プラン）、コンプライアンス整備 | ペンテスト合格 |

### 10.2 Phase 間の依存関係

```
Phase 1 (localStorage) ──→ Phase 2 (Supabase 同期 + ローン2件)
                              │
                              ├─→ Phase 3 (CSV 検出 + 12ヶ月)
                              │
                              └─→ Phase 4 (公開: APIキー再設計, FLE, 認証強化)
```

- **Phase 1 と Phase 2 の繋ぎ**: localStorage の既存データを「初回ログイン時にバルクアップロード」するマイグレーション関数を実装する。
- **Phase 2 と Phase 3 の繋ぎ**: 銀行 CSV のパーサ基盤は Phase 2 で実装、検出ロジックは Phase 3 で追加（同じ `transactions` テーブルに書き込み）。
- **Phase 3 と Phase 4 の繋ぎ**: Phase 3 終了時点で OCR を Workers 経由に移行する事前リファクタを始める。

### 10.3 各 Phase の Done 定義

- **Phase 1 Done**: 社長が毎朝開いて翌月差分を確認、4グループ + 数枚のカード + 数十件の取引で動作。
- **Phase 2 Done**: 社長が PC とスマホで同じデータを見られる、自動車・カメラローンが Loan として登録、住宅ローンが RecurringFixed として登録、両方が翌月差分計算に正しく反映。
- **Phase 3 Done**: 銀行 CSV を取り込むと固定費候補が自動提示され、承認すると引落予測に反映、12ヶ月先まで赤字月がハイライト表示。
- **Phase 4 Done**: 外部ペンテスト合格、Stripe 課金、Magic Link + MFA、APIキー保管再設計完了。

---

## 11. 既存実装からの差分（コード変更指針）

### 11.1 残すもの（流用）

- React + TypeScript + Vite + Zustand + Tailwind の技術スタック
- `src/lib/csv.ts`（CSV パース基盤）→ 銀行 CSV モードへ拡張
- `src/lib/storage.ts`（localStorage 抽象化）→ Phase 2 で `cloudStorage.ts` を別追加
- `src/pages/Transactions.tsx` → カード絞り込みを追加
- `src/pages/Import.tsx` → モード切替（カード/銀行）を追加
- `src/pages/AppSettings.tsx` → 月収・ボーナス・カード管理を追加
- `src/lib/ai.ts`（Anthropic Vision、Phase 1〜3 はそのまま）

### 11.2 捨てる／降格させるもの

- **トップ画面の「カテゴリ別残り予算」を主役から外す**（Dashboard 全面書き換え）
- カテゴリ別予算機能 → `/settings/budget` に降格
- レシート撮影入力（AI Vision）→ 導線から削除（コードは残す、Phase 4 で復活）
- 「今日使える金額 = 残予算 ÷ 残り日数」表示（旧版） → 廃止。新版は FP §5 の `safe_daily_budget` に置き換え
- 固定費の「毎月1日に自動計上」ロジック → 廃止、締め日ベースの予測に置き換え
- 旧仕様の `Settings.anthropicApiKey` の **取り扱いは Phase 1〜3 では現状維持（D2）**

### 11.3 新規作成

- **型**: `BillingGroup` / `Card` / `CardMaster` / `Loan` / `RecurringFixed` / `Income`（§9.1）
- **ロジック**:
  - `src/lib/billingCycle.ts`（締め日サイクル集計、§5.2）
  - `src/lib/forecast.ts`（翌月差分・12ヶ月予測、§5.3 / §5.5）
  - `src/lib/holiday.ts`（祝日マスタ＋翌営業日繰延）
  - `src/lib/recurringDetector.ts`（固定費自動検出 / Phase 3）
  - `src/lib/bankCsvSchema.ts`（CSV 列名自動マッピング / Phase 3）
- **ページ**:
  - `Dashboard.tsx` を**全面書き換え**
  - `BillingGroups.tsx`（Phase 1）
  - `Cards.tsx`（カード一覧と追加・編集 / Phase 1）
  - `Loans.tsx`（自動車・カメラ2件 / Phase 2）【D4】
  - `RecurringFixedList.tsx`（住宅ローン含む固定費 / Phase 2）【D4】
  - `CashflowTimeline.tsx`（12ヶ月ビュー / Phase 3）
- **コンポーネント**:
  - `BillingGroupCard` / `MonthDiffHero` / `BillingCalendar` / `CardChip` / `SignalBadge`
  - `RecurringCandidateList`（Phase 3）
- **データ**: `CardMaster` の初期データ（セゾン / イオン / JCB / 三井住友 / 楽天 / アメックス 等）
- **同期（Phase 2 / D3）**: `src/lib/sync.ts`（zustand ↔ Supabase の双方向 sync、`updated_at` LWW）
- **バリデーション**: `src/lib/validators.ts`（`zod` で `z.number().int().finite().safe()` を全エンドポイントに、D1）

### 11.4 既存型の Breaking Change

```typescript
// Transaction に cardId を追加
type Transaction = {
  ...
  card_id?: string  // 新規・任意
  updated_at: string  // 同期用（Phase 2 / D3）
}

// Settings 拡張
type Settings = {
  ...
  income: Income
  bonuses: { month: number; amount: number }[]
  sync_enabled: boolean
  saving_goal_monthly: number
}
```

**マイグレーション:** localStorage 既存データに対し `card_id = undefined`、`updated_at = new Date().toISOString()` で defensive parsing。

### 11.5 ディレクトリ構成（Phase 2 完了後の目標）

```
src/
├ components/
│  ├ BillingCalendar.tsx
│  ├ MonthDiffHero.tsx
│  ├ GroupBreakdownList.tsx
│  ├ CardChip.tsx
│  ├ SignalBadge.tsx
│  └ BottomNavV2.tsx
├ pages/
│  ├ Dashboard.tsx      # 全面書き換え
│  ├ Cards.tsx
│  ├ BillingGroups.tsx
│  ├ Add.tsx            # カード必須化
│  ├ Transactions.tsx
│  ├ Import.tsx
│  ├ Loans.tsx          # D4
│  ├ RecurringFixed.tsx # D4
│  └ Settings/*
├ lib/
│  ├ billingCycle.ts
│  ├ forecast.ts
│  ├ holiday.ts
│  ├ recurringDetector.ts  # Phase 3
│  ├ bankCsvSchema.ts      # Phase 3
│  ├ csv.ts
│  ├ storage.ts
│  ├ cloudStorage.ts       # Phase 2
│  ├ sync.ts               # Phase 2 / D3
│  ├ validators.ts         # D1
│  └ ai.ts
├ store/
└ types/
```

---

## 12. オープンクエスチョン

> 7名の文書および本書統合過程で残った、社長判断が必要な残課題。

1. **複数月の引落予定一覧の必要性**（UI §10.1）: 当面は当月＋翌月のみで十分か、3ヶ月先までホームに常設するか。**現状の本書方針**: 3ヶ月タイムラインで十分（PdM §1.4）と判断したが、社長の使用感で再評価。
2. **デビット・銀行直接引落の扱い**（UI §10.3）: 「現金」と同じく即時計上で確定か。**現状の本書方針**: Yes（グループ非所属）。
3. **未締め取引の UI 表現**（UI §10.4）: 確定／予測の境界をどう示すか。**現状の本書方針**: 未締めは金額に `~` プレフィクス＋amber 微表示。
4. **収入の入力モード既定**（FP §4.1）: 手取り or 額面。**現状の本書方針**: 手取り既定。フリーランス対応は Phase 4 で再検討。
5. **Phase 2 の認証範囲**（D3 関連）: 社長 1 人の同期のために Magic Link を入れるか、それとも仮の `device_token` 方式（事前共有秘密）で十分か。Magic Link を採用するとメール送信のセットアップが必要。**判断必要**。
6. **Phase 4 の API キー方式**（D2）: 方針 A（サービス所有）か方針 B（BYOK）か。コストとユーザー獲得のバランスで決定。**Phase 4 入り口で再評価**。
7. **横断学習の長期方針**（D3 補足）: Phase 4 で SaaS 化した後、学習データが十分に集まった段階で再度オプトイン共有プールを検討するか、永久に不採用とするか。
8. **住宅ローン以外の固定金利ローンが将来発生した場合**（D4 関連）: それも `RecurringFixed` で扱うか、Loan の繰上返済機能を Phase 4 で追加するか。
9. **タイムライン上の引落予定の確定／予測区別**（FP §3.3 / QA CR-20）: 締め日経過済みは「確定」、未来分は「予測」と表示する。色分け or プレフィクスの最終決定が必要。

---

*本書は社長決定 D1〜D4 を反映した kakebo の唯一の指針である。各ロール文書（`docs/roles/*.md`）は本書の補足資料として参照する。矛盾があれば本書を採る。*
