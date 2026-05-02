# kakebo クラウドアーキテクチャ提案書

> Role: Cloud Engineer
> Target: 家計簿 SaaS (kakebo) のマルチテナント・クラウド同期化
> Last updated: 2026-05-02

家計簿 SaaS は「金融データを扱う」「個人ユーザー中心」「単価が低く規模で稼ぐ」「日本居住者ユーザーが大半」という特性がある。これを軸に、過剰投資せず段階的に進化させるアーキテクチャを提案する。

---

## 1. 段階的アーキテクチャ進化案

### Phase 1: localStorage 完結期（〜数百人 / 無料配布）

**ゴール:** バックエンド費用ゼロのまま PMF を探る。

- 現行の React + TypeScript + Vite SPA を継続。
- GitHub Pages → **Cloudflare Pages** に移行（独自ドメイン・HTTPS・プレビュー・国内エッジ配信）。
- localStorage を **IndexedDB（Dexie.js）** に置き換え、容量制限と将来の差分同期に備える。
- データの **JSON エクスポート / インポート** 機能を実装（ユーザー自身の責任でバックアップ可能に）。
- 端末紛失リスクを軽減する目的で、**E2EE 任意クラウドバックアップ**（後述 Phase 2 への布石）を視野に。
- レシート OCR は「ユーザー自前の Anthropic API キーを設定する」モードを暫定提供（収益化前のサーバ費用を抑える）。

**やらないこと:** 認証、課金、サーバ DB、マルチテナント。

**この Phase の限界（移行トリガー）:**
- 複数端末同期の要望が増えた
- 有料化の準備が整った
- OCR を「アプリ機能として」提供したくなった

---

### Phase 2: 最小バックエンド導入（〜数千人 / 月額課金開始）

**ゴール:** 最小工数で「クラウド同期 + 認証 + 課金 + OCR + CSV 安全処理」を成立させる。

#### 推奨スタック

| レイヤ | 採用 | 理由 |
| --- | --- | --- |
| フロント配信 | **Cloudflare Pages** | 国内エッジ・無料枠厚い・Workers と統合しやすい |
| 認証・DB・Storage | **Supabase (Tokyo region / ap-northeast-1)** | Postgres + RLS で「マルチテナント分離」を SQL レベルで強制でき、家計簿のような行レベル分離と相性最良。Auth (OAuth/Magic Link) と Storage (CSV/レシート画像) も同梱 |
| 軽量 API / Edge | **Cloudflare Workers** | OCR 中継・Webhook 受け・レート制御。Supabase Edge Functions と二択だが、課金 Webhook と OCR バッチは Workers の方が柔軟 |
| 重い処理 | **Supabase Edge Functions (Deno)** | Postgres と同一 VPC 内で完結する重め処理（CSV パース、集計バッチ） |
| OCR | **Anthropic Claude Vision API** | レシート画像 → 構造化 JSON。Workers から呼ぶ |
| 決済 | **Stripe (日本)** | サブスク・請求書・税対応が最も成熟 |
| メール | **Resend** or **Amazon SES** | マジックリンク・領収書送付 |
| エラートラッキング | **Sentry** | フロント + Edge 両方をカバー |
| CI/CD | **GitHub Actions** | 既存資産を活かす |

#### なぜ AWS / Vercel ではなく Supabase + Cloudflare か

- **AWS フルスタック (Cognito + RDS + Lambda + API Gateway):** 自由度は最高だが、1000 人規模で月 $200〜400 と過剰。RLS 相当を自前で書くコストも高い。Phase 3 の銀行 API 連携が見えた段階で部分採用する想定。
- **Vercel + Neon/PlanetScale:** DX は良いが、Vercel の egress 課金とサーバレス Postgres の cold start が家計簿のような「小さく頻繁な書き込み」と相性が悪い。日本リージョン Postgres も弱い。
- **Supabase + Cloudflare:** Postgres RLS でテナント分離を宣言的に書けるのが家計簿 SaaS の最大の決め手。Tokyo リージョンも提供。Cloudflare は egress 無料 + 国内エッジ配信。コストが線形に伸びる。

---

### Phase 3: マルチテナント本格運用（〜数万人 / 銀行 API・法人プラン）

**ゴール:** 信頼性・コンプライアンス・スケールを担保。

- **アカウント階層導入:** `organizations`（家族・世帯）→ `users` → `data`。家族共有プランや法人プランに対応。
- **書き込み分離:** Postgres を `db_main` と `db_analytics` (read replica) に分離。月次集計はレプリカで。
- **銀行 API 連携:** Moneytree LINK / マネーフォワード ME 連携 API / 各行 API を専用 **Worker (or AWS Lambda in VPC)** に閉じ込め、認証情報は **AWS Secrets Manager** または **HashiCorp Vault** に。Postgres には保存しない。
- **金融データ専用エンクレーブ:** 銀行連携トークン・CSV 原本は別スキーマ／別バケットに分離し、アプリ DB から直接 join できないようにする。
- **監査ログ:** 全書き込みを `audit_log` テーブル + S3/R2 への append-only export。
- **WAF / DDoS:** Cloudflare WAF + Bot Management。
- **SOC2 / ISMS 準拠を見据えた基盤:** IaC (Terraform)、最小権限 IAM、定期的な脆弱性スキャン (Snyk / Dependabot)、ペネトレーションテスト。
- **オプション:** 規制が厳しくなれば AWS (ap-northeast-1) のフル構成 (Aurora + ECS Fargate + Cognito) に部分移行。Supabase は引き続きアプリ DB として併用可能。

---

## 2. 推奨スタック総括（家計簿 SaaS ドメイン適合性）

| 観点 | Supabase + Cloudflare | Vercel + Neon | AWS フル |
| --- | --- | --- | --- |
| マルチテナント分離 | ◎ (RLS) | △ (自前) | ○ (自前 / 設計次第) |
| 日本リージョン | ◎ (Tokyo) | △ | ◎ |
| 月額コスト (1000人) | ◎ ($25〜80) | ○ ($50〜150) | △ ($200〜) |
| 運用負荷 | ◎ | ○ | △ |
| 銀行 API 連携将来性 | ○ (Worker 経由) | △ | ◎ |
| 採用 | **Phase 2 採用** | 不採用 | **Phase 3 部分採用** |

---

## 3. データモデル初期案

Postgres を前提。`tenant_id` をすべてのテーブルに持たせ、RLS で `auth.uid()` ベースの分離を強制する。

```sql
-- ユーザーとテナント (Phase 3 で organizations を追加)
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  locale text default 'ja-JP',
  timezone text default 'Asia/Tokyo',
  plan text default 'free',         -- free / standard / family
  stripe_customer_id text,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

-- 課金グループ（クレカ請求月のグルーピング: 既存ドメイン）
create table billing_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,                -- 例: 楽天カード / 現金
  closing_day smallint,              -- 締め日
  payment_day smallint,              -- 引落日
  created_at timestamptz default now()
);

-- 支払い手段（カード・銀行口座）
create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  billing_group_id uuid references billing_groups(id),
  kind text not null,                -- credit / debit / bank / cash / emoney
  brand text,                        -- visa / jcb / etc
  last4 text,                        -- 平文保存可（暗号化対象外）
  display_name text not null,
  color text,
  created_at timestamptz default now()
);

-- 取引明細（中核テーブル）
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid references cards(id),
  occurred_on date not null,         -- 利用日
  amount_jpy bigint not null,        -- 円・整数
  category text,                     -- 食費 / 光熱費 / ...
  merchant text,
  memo text,
  receipt_image_id uuid references receipts(id),
  source text not null,              -- manual / csv / ocr / bank_api
  source_ref text,                   -- 元データの参照キー（重複防止）
  created_at timestamptz default now()
);
create index on transactions (user_id, occurred_on desc);
create unique index on transactions (user_id, source, source_ref) where source_ref is not null;

-- 銀行/カード CSV 取込
create table bank_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid references cards(id),
  storage_path text not null,        -- Supabase Storage の暗号化バケット
  original_filename text,
  status text not null,              -- uploaded / parsing / parsed / failed
  rows_total int,
  rows_imported int,
  error_message text,
  created_at timestamptz default now()
);

-- レシート OCR
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  storage_path text not null,
  ocr_status text not null,          -- pending / processing / done / failed
  ocr_result_jsonb jsonb,
  created_at timestamptz default now()
);

-- ローン・分割払い（既存ドメイン）
create table loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid references cards(id),
  principal_jpy bigint not null,
  interest_rate numeric(5,3),
  start_on date not null,
  months smallint not null,
  monthly_payment_jpy bigint,
  note text,
  created_at timestamptz default now()
);

-- 監査ログ（Phase 3）
create table audit_log (
  id bigserial primary key,
  user_id uuid,
  action text not null,
  target_table text,
  target_id uuid,
  payload jsonb,
  ip inet,
  ua text,
  created_at timestamptz default now()
);
```

**RLS 例:**

```sql
alter table transactions enable row level security;
create policy tx_owner on transactions
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

すべての主要テーブルに同様の RLS を貼り、テナント分離を SQL 層で保証する。

---

## 4. 認証設計

家計簿は「毎日開く・パスワード忘れがちなライト層も多い・でもデータは超センシティブ」という難しいバランス。

### 推奨

- **Magic Link (メール)** をデフォルト。パスワードレスで離脱率が低い。
- **Google / Apple SSO** を併設。iOS は Apple Sign-In 必須に注意。
- **パスワード認証は提供しない**（漏洩リスク・サポート負荷を回避）。
- **2FA (TOTP)** はオプション。「銀行連携を有効化したユーザー」には強制（Phase 3）。
- **再認証ステップ:** CSV 一括削除・データエクスポート・退会など破壊的操作は、直近 5 分以内に再認証していない場合 Magic Link を再送。
- **セッション:** Supabase Auth の JWT を使用。Refresh token rotation 有効、有効期限はアクセス 1h / リフレッシュ 30d。
- **Sensitive 操作のレート制限:** Cloudflare Turnstile を Magic Link 発行に挟み、ブルートフォース・ハーベスティングを抑制。

---

## 5. 金融データの扱い

### 暗号化

- **In transit:** TLS 1.3 強制（Cloudflare で min TLS 設定）。HSTS preload。
- **At rest:**
  - Postgres: Supabase デフォルトで AES-256 ディスク暗号化。
  - **アプリ層追加暗号化:** 銀行口座番号・銀行連携トークン・CSV 原本は **pgcrypto** で列暗号化。鍵は **AWS KMS** または **Supabase Vault** 管理。
  - 鍵はテナント単位 (envelope encryption) で派生。インシデント時に特定ユーザーだけ鍵 rotate 可能に。
- **Storage:** Supabase Storage の暗号化バケットに保存し、署名付き URL は短期 (5 分) のみ。
- **クライアント側 E2EE オプション:** 上位プランで「メモ・タグの E2EE」を提供（鍵はパスフレーズ由来、サーバは復号できない）。OCR・集計が必要な数値データは E2EE 対象外。

### バックアップ

- Supabase の **PITR (Point-in-Time Recovery)** を有効化（7 日 → 30 日に拡張）。
- 日次論理バックアップを **Cloudflare R2** にクロスリージョン保管（Tokyo → Osaka or Tokyo → US-West の暗号化レプリカ）。
- 月次でリストア訓練（DR ドリル）を実施。

### 地理的データ保管

- 一次データは **ap-northeast-1 (Tokyo)** に固定。
- バックアップのみ国外を許容するが、暗号化前提・鍵は国内 KMS で管理。
- プライバシーポリシーに「日本国内に保存・米国にバックアップを暗号化保管」と明記。
- 個人情報保護法（改正後）の越境移転規定を遵守。

### CSV アップロードの安全処理

1. クライアント → 署名付き URL で Supabase Storage に直接 PUT（API サーバを経由させない）。
2. ストレージ側でウイルススキャン（Cloudflare R2 + ClamAV ワーカー、または Supabase の hook）。
3. Edge Function が CSV をパース → `transactions` に投入。
4. 原本 CSV は 90 日後に自動削除（ユーザー設定で無効化可）。
5. パース時は **iconv** で SJIS → UTF-8 を確実に処理（日本の銀行 CSV は SJIS が多い）。

---

## 6. API 設計の方向性

### 推奨: tRPC + Supabase 直叩きのハイブリッド

| 方式 | 採用範囲 | 理由 |
| --- | --- | --- |
| **Supabase クライアント (PostgREST)** | 取引一覧・登録・編集・集計など CRUD 中心 | RLS 済み、フロントから直接叩ける、型は `supabase gen types` で自動生成 |
| **tRPC on Cloudflare Workers** | OCR 起動、CSV パース起動、Stripe Webhook 連動、銀行 API 連携 | 副作用のある操作・外部連携。tRPC で型安全を確保 |
| **Webhooks (REST)** | Stripe / 銀行 / メールベンダー受け | 外部仕様準拠 |

**GraphQL を採用しない理由:** 家計簿のクエリパターンは単純（ユーザーごとに直近 N 件＋集計）で、PostgREST の RPC + view で十分。GraphQL のスキーマ運用コストに見合わない。

**REST 単体ではなく tRPC を選ぶ理由:** TypeScript モノレポで end-to-end 型安全が成立し、OpenAPI 生成の手間が省ける。外部公開 API が必要になった段階で tRPC → REST のアダプタを薄く書く。

---

## 7. デプロイ・CI/CD

### 環境

- `local` (開発者ローカル, supabase start)
- `preview` (PR ごとの一時環境, Cloudflare Pages preview + Supabase branch DB)
- `staging` (常設, 本番相当データのマスキング版)
- `production`

### GitHub Actions パイプライン

```
push to feature/*
  ├─ lint / typecheck / unit test
  ├─ vitest + playwright (E2E smoke)
  └─ deploy preview (Cloudflare Pages + Supabase branch)

merge to main
  ├─ 全テスト
  ├─ DB migration dry-run (supabase db diff)
  ├─ deploy to staging
  └─ E2E (staging)

tag v*.*.*
  ├─ DB migration apply (production)
  ├─ deploy Workers / Pages (production, blue-green)
  ├─ smoke test (production read-only)
  └─ Slack 通知
```

- **Secrets:** GitHub Environments + OIDC で AWS/Cloudflare/Supabase に短期トークンで認証。長期キーは置かない。
- **DB migration:** `supabase migration` で SQL ファイル管理。本番適用は手動承認ゲート必須。
- **ロールバック:** Cloudflare Pages はデプロイメント差し替えで即時。DB は forward-only マイグレーション + 影響範囲限定の reverse スクリプトを用意。

---

## 8. 観測性

| 種類 | ツール | 何を見るか |
| --- | --- | --- |
| エラートラッキング | **Sentry** (frontend + Workers + Edge Functions) | 例外・パフォーマンス・リリースごとの劣化 |
| ログ | **Cloudflare Logpush → R2**, **Supabase Log Drains → Axiom** | 構造化 JSON。30 日保持、監査用は 1 年 |
| メトリクス | **Grafana Cloud (free tier)** または **Better Stack** | API レイテンシ・DB 接続数・OCR 成否 |
| アップタイム監視 | **Better Stack / UptimeRobot** | 主要エンドポイント・サインインフロー |
| プロダクト分析 | **PostHog (self-host or cloud EU)** | 機能利用率・ファネル・コホート。金融データ自体はイベントに乗せない |
| 監査ログ | Postgres `audit_log` + R2 export | コンプライアンス用 |

**SLO 初期目標:**
- 可用性: 99.5% (月 3.6h ダウン許容)
- API p95 レイテンシ: 300ms
- ジョブ (OCR / CSV) 成功率: 99%

**アラート:** PagerDuty は不要、Slack + メールで十分。エラー率 > 1% / 5min、5xx 急増、DB 接続枯渇、Stripe Webhook 失敗を即時通知。

---

## 9. コスト試算（ユーザー 1000 人時点）

前提:
- 月間アクティブ 700 人、CSV 取込 1 人/月、レシート OCR 30 枚/月平均、月次集計閲覧 60 回/人。
- データ量: 1 ユーザーあたり取引 200 件/月、レシート画像 10MB/月。
- 有料転換率 5% (50 人 × 月 480 円 = 24,000 円売上)。

| 項目 | サービス | 月額 (USD) | 備考 |
| --- | --- | --- | --- |
| フロント配信 | Cloudflare Pages | $0 | 無料枠で十分 |
| Edge / Worker | Cloudflare Workers Paid | $5 | リクエスト 1000 万まで含む |
| DB / Auth / Storage | Supabase Pro (Tokyo) | $25 | 8GB DB + 100GB egress + PITR |
| 追加ストレージ | Supabase add-on | $5 | 画像 100GB 想定 |
| OCR | Anthropic Claude API | $30〜60 | 30 枚 × 700 人 × 約 $0.003/枚 ≒ $63 (上限) |
| メール | Resend | $0〜20 | Magic Link + 領収書 |
| 決済 | Stripe | 売上の 3.6% | 売上 24,000 円 → 約 $6 (¥864) |
| エラー監視 | Sentry Team | $26 | |
| ログ | Axiom / Better Stack | $0〜25 | 無料枠運用想定 |
| 監視 | Better Stack | $0 | 無料枠 |
| ドメイン・その他 | - | $2 | |
| **合計目安** | | **約 $120〜170 / 月（≒ 18,000〜26,000 円）** | |

**収支:** 売上 24,000 円 − インフラ 22,000 円 = ほぼトントン。1000 人時点では **有料転換率 5% では赤字寸前** であり、転換率 8〜10% を目指すか、家族プラン (1,200 円) を作って ARPU を引き上げる必要がある。**Phase 3 の 1 万人規模で初めて健全な単位経済性に到達する**前提で計画を組むのが現実的。

**コスト最適化の打ち手（順序）:**
1. OCR を「有料プランのみ機能」にして従量費を売上連動にする（最重要）。
2. 無料ユーザーは 90 日経過した CSV 原本を自動削除。
3. Cloudflare R2 の egress 0 を活かし、画像配信を Supabase Storage から R2 にオフロード。
4. Supabase の compute サイズはユーザー 5000 人を超えるまで Small で十分。

---

## 付録: 移行ロードマップ概観

| 時期 | マイルストーン |
| --- | --- |
| M0 | Cloudflare Pages 移行・IndexedDB 化・JSON エクスポート |
| M1 | Supabase 立ち上げ・Magic Link 認証・取引 CRUD のクラウド同期（オプトイン） |
| M2 | Stripe 課金・OCR 機能（有料）・CSV 取込 |
| M3 | 家族プラン・監査ログ・PITR |
| M4+ | 銀行 API 連携・SOC2 準備・AWS 部分移行 |

---

以上。Phase 1 → Phase 2 への移行は、ユーザー要望（同期）と収益化の準備が揃った段階で 1〜2 ヶ月で着手可能な設計とした。Phase 3 は規制要件と規模で必要性が決まるため、Phase 2 で得た運用知見をもとに再評価する前提でよい。
