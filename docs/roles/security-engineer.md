# セキュリティエンジニア: kakebo 脅威モデリング & セキュリティ要件

最終更新: 2026-05-02
対象: kakebo（家計簿 SaaS、公開予定）
ステータス: 現状 React SPA + localStorage、APIキーをブラウザに平文保存。バックエンド・マルチテナント化・月額課金を前提に再設計を行う。

優先度の表記:
- **Must**: 公開（GA）前に必須。これが満たされない状態で本番公開してはならない。
- **Should**: 公開直後〜3ヶ月以内に対応。
- **Nice**: 余力があれば対応、または成熟期に対応。

---

## 1. 脅威モデリング（STRIDE）

対象アセット:
- ユーザー認証情報（メール、パスワードハッシュ、セッショントークン）
- 金融情報（カード利用履歴、銀行取引 CSV、ローン情報、収入額、レシート画像）
- Anthropic APIキー（ユーザー所有 / サービス所有の両方）
- 課金情報（Stripe 等の外部 PSP に委譲、kakebo 側ではトークンのみ）
- 集計済みダッシュボード・レポート

信頼境界:
1. ブラウザ（クライアント）↔ kakebo API（バックエンド）
2. kakebo API ↔ DB / オブジェクトストレージ
3. kakebo API ↔ Anthropic API（外部）
4. テナント A ↔ テナント B（論理境界）

### 1.1 Spoofing（なりすまし）
| 脅威 | 緩和策 | 優先度 |
| --- | --- | --- |
| 他人のアカウントに不正ログイン（クレデンシャルスタッフィング） | bcrypt/Argon2id によるパスワードハッシュ、レート制限、HIBP API による既知漏洩 PW 拒否、MFA（TOTP）必須化 | Must |
| セッショントークン窃取によるなりすまし | HttpOnly + Secure + SameSite=Lax の Cookie、短寿命アクセストークン + リフレッシュトークン回転、デバイス・IP 異常検知 | Must |
| メールアドレス所有確認のバイパス | サインアップ時のメール確認必須、未確認状態では金融データ操作を不可 | Must |
| 偽サイト（フィッシング） | カスタムドメイン + EV/OV 証明書、DMARC/SPF/DKIM 設定、ユーザー教育（公式ドメインの明示） | Should |

### 1.2 Tampering（改ざん）
| 脅威 | 緩和策 | 優先度 |
| --- | --- | --- |
| クライアント側で取引データを改ざん（金額・カテゴリの不正書換） | サーバー側を Source of Truth に。クライアントからの変更は API で検証（スキーマ・所有権チェック）。整合性ハッシュは monthly snapshot に付与 | Must |
| CSV インポート時の悪意ある CSV（CSV インジェクション、`=cmd|...`） | インポート時に先頭文字 `=`, `+`, `-`, `@`, タブ等をエスケープ。バイナリ/異常エンコーディング拒否 | Must |
| レシート画像へのマルウェア混入 | MIME と magic number の両方で画像検証、再エンコード、ClamAV スキャン、CDN 配信時に `Content-Disposition: attachment` | Should |
| DB テーブル直接改ざん | 最小権限 DB ロール、書込みは ORM 経由のみ、監査ログ（append-only） | Must |

### 1.3 Repudiation（否認）
| 脅威 | 緩和策 | 優先度 |
| --- | --- | --- |
| 「自分は取引を消していない」と否認 | 監査ログ（user_id、action、resource、ip、ua、timestamp）を append-only で保管、改ざん検知ハッシュチェーン | Should |
| 課金トラブルの否認 | Stripe 側のイベントログを Source of Truth に、Webhook 受信ログを保存 | Must |
| AI 利用ログの否認 | Anthropic API 呼び出しの request_id をユーザー単位で保存 | Should |

### 1.4 Information Disclosure（情報漏洩）
| 脅威 | 緩和策 | 優先度 |
| --- | --- | --- |
| **localStorage に平文で API キー・金融データ → XSS で全奪取** | 後述「7. APIキー管理」「3. 現状コード評価」を参照。バックエンドプロキシ + httpOnly Cookie に移行 | Must |
| テナント越境（IDOR） | すべての DB クエリに `WHERE tenant_id = current_user.tenant_id` を強制。ORM レベルで自動付与（Row Level Security or Repository 層強制） | Must |
| 検索エンジンへのインデックス | 認証保護領域は `X-Robots-Tag: noindex`、未公開 URL は推測困難な ID（UUIDv4） | Should |
| ログ・エラートラッカへの PII 流出 | Sentry 等への送信前に PII スクラビング、金額・口座番号・APIキーをマスク | Must |
| バックアップからの漏洩 | バックアップも at-rest 暗号化、別アカウント/別 KMS キー、定期的な復元テスト | Must |

### 1.5 Denial of Service（DoS）
| 脅威 | 緩和策 | 優先度 |
| --- | --- | --- |
| AI 機能濫用（Anthropic API 大量呼出） | ユーザー単位レート制限、月次クォータ、課金プラン連動、サーキットブレーカ | Must |
| 大容量 CSV / 画像アップロード | 上限サイズ（CSV 10MB / 画像 5MB）、行数上限、ストリーミング解析 | Must |
| 認証エンドポイントへのブルートフォース | IP / アカウント別レート制限、CAPTCHA、指数バックオフ | Must |
| WAF レイヤ DDoS | Cloudflare / AWS WAF + Shield、Bot 対策ルール | Should |

### 1.6 Elevation of Privilege（権限昇格）
| 脅威 | 緩和策 | 優先度 |
| --- | --- | --- |
| 一般ユーザー → 管理者昇格 | ロールは JWT 内ではなく DB 参照、JWT には `sub` のみ。管理 API は別ドメイン + IP 制限 + MFA 必須 | Must |
| サブスクプラン昇格（無料 → 有料機能） | 機能ゲートはサーバー側のみで判定。フロントの隠しフラグは UI ヒントに留める | Must |
| 依存ライブラリの脆弱性経由の RCE | Dependabot、SCA、最小権限コンテナ、read-only FS、seccomp | Should |

---

## 2. データ分類

| 区分 | 例 | 取り扱いルール |
| --- | --- | --- |
| **L4: 極秘（Secret）** | パスワードハッシュ、Anthropic APIキー、セッション/リフレッシュトークン、Stripe シークレット | 平文で保存禁止。アプリ DB に保存しない（Secrets Manager / KMS 暗号化）。ログ出力禁止。アクセスは管理者 + 監査ログ必須 |
| **L3: 機密（Confidential / 金融情報）** | カード利用履歴、銀行取引、ローン残高、収入、レシート画像 | at-rest 暗号化必須（DB 全体 + フィールドレベル）、in-transit TLS1.2+、テナント分離、エクスポート時はパスワード/署名URL保護、保管期間明示 |
| **L2: PII（個人識別情報）** | メールアドレス、氏名、表示名、IP、UA | at-rest 暗号化、最小限取得、削除要求対応（GDPR/個人情報保護法） |
| **L1: 内部** | 集計済みダッシュボード、月次サマリ | 認証必須、テナント分離 |
| **L0: 公開** | ランディングページ、利用規約 | 改ざん監視（IaC + デプロイログ） |

ルール:
- L4 は環境変数 / Secrets Manager に限定（Must）。
- L3 はフィールドレベル暗号化（後述）（Must）。
- L2/L3 のエクスポート機能は MFA 確認後にのみ許可（Should）。
- データ最小化原則: レシート画像は OCR 後に元画像を 30 日で自動削除するオプション（Nice）。

---

## 3. 現状コード（kakebo）の脆弱性評価

検査範囲: `src/lib/ai.ts`、`src/lib/storage.ts`、`src/store/index.ts`、`index.html`、`package.json`。

### 3.1 重大（Critical）
1. **Anthropic APIキーが localStorage に平文保存（`storage.ts` / `settings.anthropicApiKey`）**
   - 任意の XSS（依存ライブラリの CVE、サードパーティスクリプト、自己 XSS）で全件漏洩。
   - キーは `sk-ant-...` 形式で課金が紐づくため、漏洩 = 直接的金銭被害。
   - 緩和: バックエンドプロキシへ移行（§7）。Must。
2. **`anthropic-dangerous-direct-browser-calls: true` でブラウザ直叩き（`ai.ts`）**
   - Anthropic 自身が「本番非推奨」としているフラグ。CORS 経由でユーザー端末から直接呼んでおり、キーが必ずクライアントに露出する設計。
   - 緩和: サーバー側プロキシで `x-api-key` を付与。Must。
3. **金融データすべてが localStorage に平文保存**
   - 端末を共有する家族・盗難・マルウェアで全データ閲覧可能。
   - 緩和: バックエンド導入と DB 暗号化、または短期的にクライアント側 Web Crypto + パスフレーズ派生鍵（PBKDF2/Argon2）。Must。

### 3.2 高（High）
4. **CSP 未設定（`index.html`）**
   - XSS 影響範囲が拡大。`script-src 'self'`、`connect-src` を Anthropic / 自社 API のみに制限する。Must。
5. **`Subresource Integrity` 未設定**: 外部 CDN を使う場合は SRI 必須。Should。
6. **CSV インポートのバリデーション不足（`csv.ts`）**: CSV インジェクション・極端な行数・不正エンコーディングに対する防御未確認。Must。
7. **依存ライブラリの脆弱性監視がない**: `package-lock.json` のみで Dependabot/Renovate なし。Must。

### 3.3 中（Medium）
8. **ビルド成果物 `dist/` に APIキーが混入するリスク**: 環境変数経由でビルド時 inline されると公開される。`VITE_*` プレフィックスは公開される前提のため、シークレットは絶対に `VITE_*` に入れない。Must。
9. **エラー時のスタックトレース表示**: 本番で詳細スタック出力していないか確認。Should。
10. **HTTPS / HSTS の強制が未確認**: ホスティング側で `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`。Must。

### 3.4 低（Low）
11. **CSRF**: 現状 Cookie 認証なしのため対象外だが、バックエンド導入後は SameSite + CSRF トークンが必須。Must（バックエンド導入時）。
12. **Clickjacking**: `X-Frame-Options: DENY` または `frame-ancestors 'none'`。Should。

---

## 4. 暗号化要件

### 4.1 at rest（保存時）
- **DB 全体暗号化**（RDS/Cloud SQL の暗号化オプション、KMS 管理鍵）。Must。
- **フィールドレベル暗号化（FLE）対象カラム**（AEAD: AES-256-GCM、テナント別 DEK + KMS の KEK）:
  - `users.encrypted_anthropic_api_key`（サービス側で預かる場合）。Must。
  - `transactions.amount`、`transactions.description`、`transactions.merchant`。Must。
  - `loans.balance`、`loans.interest_rate`、`incomes.amount`。Must。
  - `bank_csv_imports.raw_blob_ref`、`receipt_images` のオブジェクトキーは推測困難な UUID + 署名 URL。Must。
- **オブジェクトストレージ（S3/GCS）**: SSE-KMS 必須、バケットポリシーで public 拒否、署名 URL は短寿命（5 分）。Must。
- **バックアップ**: 別 KMS キー、別アカウント、暗号化スナップショット、復元演習を四半期 1 回。Should。
- **鍵ローテーション**: KEK 年 1 回、DEK は再暗号化ジョブで段階移行。Should。

### 4.2 in transit（通信時）
- **TLS 1.2 以上必須**、TLS 1.3 推奨、弱い暗号スイート無効化。Must。
- **HSTS**: `max-age=63072000; includeSubDomains; preload`。Must。
- **CSP（example）**:
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://<cdn>;
  connect-src 'self' https://api.kakebo.example;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  ```
  Must。`connect-src` に `api.anthropic.com` を入れない（プロキシ経由にする）。
- その他ヘッダ: `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy` で不要 API を無効化。Must。
- **mTLS** for service-to-service（バックエンド ↔ 内部サービス）。Should。

### 4.3 クライアント側暗号化 / E2E
- **導入価値の評価**:
  - 利点: kakebo 運営者ですらユーザーの金融データを復号できなくなる → 信頼訴求と侵害被害の最小化。
  - 欠点: AI 機能（Anthropic 呼び出し）は復号した平文を扱う必要があるため真の E2E は成立しない。検索・集計・レコメンドもサーバー側でできなくなる。鍵紛失 = データ消失。
- **推奨**: 完全 E2E は採用しない。代替として:
  - 高機微フィールド（口座番号、レシート OCR 原文）は **クライアント側でユーザー鍵（パスフレーズ + Argon2id 派生）で暗号化** し、サーバーは暗号文のみ保管（オプション機能）。Should。
  - その他の取引データはサーバー側 FLE で十分。Must。
- **Web Crypto API** で実装、鍵は端末のみ（IndexedDB + non-extractable CryptoKey）。Should。

---

## 5. 認証・認可

### 5.1 パスワード方針（Must）
- 8 文字以上、長さ重視（NIST SP 800-63B 準拠）、複雑性ルールは強制しない。
- HIBP Pwned Passwords で既知漏洩 PW 拒否（k-anonymity API）。
- ハッシュ: **Argon2id**（m=64MB, t=3, p=1）。bcrypt(12) は次善。
- パスワード再利用防止（直近 5 件）。
- リセットフロー: ワンタイムトークン（30 分）、トークン使い捨て、URL に PII を含めない。

### 5.2 MFA（Must）
- TOTP（RFC 6238）必須化を有料プランで強制、無料プランでも推奨。
- バックアップコード 10 個、暗号化保存。
- WebAuthn（パスキー）対応。Should。
- SMS は補助のみ（SIM スワップ耐性なし）。Nice。

### 5.3 セッション管理（Must）
- アクセストークン: JWT（短寿命 15 分）または不透明トークン。
- リフレッシュトークン: 不透明、回転（Reuse Detection）、HttpOnly + Secure + SameSite=Lax Cookie、寿命 14 日。
- ログアウト時はサーバー側で revoke。
- 同時セッション一覧と「全デバイスからログアウト」機能。
- IP / UA 大幅変化時に再認証要求。Should。

### 5.4 トークン
- API トークン（CLI/連携用）は scope 付き、ユーザーが個別失効可能、最後に表示後はハッシュのみ保存。Should。

### 5.5 認可モデル（マルチテナント）（Must）
- モデル: 個人ユーザー = 1 テナント。将来は「家族プラン」で 1 テナント = 複数ユーザー。
- すべてのリソースに `tenant_id` 必須、PostgreSQL の **Row Level Security (RLS)** を有効化し、コネクション開始時に `SET app.current_tenant`。
- アプリ層でも Repository に `tenant_id` 引数を強制（depth-in-defense）。
- 管理者 API は別 ALB / 別ドメイン、IP 制限、MFA、操作監査。
- 権限モデル: RBAC（owner / member / viewer）。家族プラン導入時。Should。

---

## 6. APIキー管理（Anthropic）

### 6.1 現状
- ユーザーが自分の Anthropic キーを設定 → localStorage 保存 → ブラウザから直接 `api.anthropic.com` を `anthropic-dangerous-direct-browser-calls` で叩く。
- リスク: XSS で全ユーザーのキーが漏洩。CORS 経由で常にクライアントに露出。

### 6.2 改善案（バックエンドプロキシ）（Must）
- **方針 A: kakebo がサービス所有のキーで提供（推奨）**
  - ユーザーは自分のキーを入力しない。kakebo 側の Anthropic キーを使い、利用量で課金（プラン or 従量）。
  - キーはサーバー環境変数 / Secrets Manager にのみ存在。
  - レート制限・コスト上限・プロンプトログ監査をサーバー側で一元管理可能。
  - フロー: ブラウザ → `POST /api/ai/chat`（認証 Cookie）→ kakebo API → `api.anthropic.com`。
- **方針 B: BYOK（Bring Your Own Key）を残す場合**
  - キーはサーバー側で **エンベロープ暗号化**（AES-256-GCM + KMS KEK）して DB 保存。
  - 復号は API リクエスト処理中のみメモリ上で行い、ログに出さない。
  - キー検証は最小トークン消費の API（`/v1/models`）で。
  - ユーザーがいつでも削除・ローテ可能、最終 4 文字のみ表示。
- 短期措置（バックエンド未導入の段階）: localStorage を Web Crypto + パスフレーズ派生鍵で暗号化、毎回入力。Should（あくまで暫定）。
- `anthropic-dangerous-direct-browser-calls` ヘッダはバックエンド導入と同時に削除。Must。

### 6.3 シークレット運用（Must）
- 開発・本番のキーを分離、コードリポジトリに絶対に commit しない（gitleaks / trufflehog を pre-commit と CI で）。
- ローテーション計画: 90 日に 1 回、または侵害時即時。
- IaC で Secrets Manager 参照、環境変数注入。

---

## 7. 依存ライブラリ・サプライチェーン

| 項目 | 内容 | 優先度 |
| --- | --- | --- |
| `npm audit` を CI で実行（critical / high で fail） | GitHub Actions に組込み | Must |
| Dependabot / Renovate 有効化 | weekly auto-PR、major は手動レビュー | Must |
| **SBOM 生成**（CycloneDX / SPDX） | リリースごとに生成・保管、`syft` または `cdxgen` | Should |
| ロックファイル必須（`package-lock.json`） | 既に存在。`npm ci` でビルド | Must |
| パッケージピン（`save-exact`）+ プロビナンス検証 | `npm install --provenance` | Should |
| Typosquatting 検知 | `socket.dev` などのレビュー、新規追加パッケージは PR でレビュー必須 | Should |
| シークレットスキャン | gitleaks を pre-commit + CI、GitHub Secret Scanning 有効化 | Must |
| ビルドの再現性 | Docker base image を digest pin、`npm ci --ignore-scripts` 検討 | Should |
| ライセンスチェック | GPL 系の混入を CI で検出 | Nice |

---

## 8. インシデント対応計画（IR）

### 8.1 体制
- **Incident Commander**: セキュリティエンジニア（一次）、CTO（エスカレ）。
- **連絡経路**: Slack 専用チャネル `#sec-incident`、PagerDuty。
- **法務・広報**: 法務担当、広報担当をオンコール登録。

### 8.2 重大度
- **SEV1**: 顧客データ漏洩、サービス全停止、金銭被害。
- **SEV2**: 機能限定停止、軽微な漏洩懸念。
- **SEV3**: 単一ユーザー影響。

### 8.3 フロー（Must）
1. **検知**（5 分以内）: 監視アラート、ユーザー通報、外部報告。
2. **トリアージ**（15 分以内）: SEV 判定、IC アサイン。
3. **封じ込め**（1 時間以内）: 影響キーの失効、該当アカウントロック、デプロイ停止、ネットワーク隔離。
4. **根絶**: 脆弱性修正、悪意あるアーティファクト削除。
5. **復旧**: 段階的にサービス再開、監視強化期間を設定。
6. **事後**（5 営業日以内）: 非難なし RCA（Postmortem）作成、再発防止タスク化。

### 8.4 通知義務（Must）
- **個人情報保護法（日本）**: 「個人データ漏えい等」が発生した可能性を認識した時点で、**速やかに**個人情報保護委員会へ報告（速報）し、**おおむね 30 日以内**（不正アクセス起因等の場合 60 日以内）に確報。本人通知も原則必須。設問記載の「72 時間」は **GDPR の管理者の通知義務**（72 時間以内に監督機関へ）であり、こちらは EU 居住者データを扱う場合に追加適用。
- **PCI DSS**: kakebo がカード番号自体を保管しない設計（Stripe 等にトークン化を委譲）にすることで適用範囲を SAQ-A まで縮小。Must。
- **テンプレート**: 報告書、ユーザー通知メール、プレスリリースを事前に用意。Should。
- **机上演習**: 半年に 1 回。Should。

---

## 9. コンプライアンス

| 法令・基準 | 適用 | 対応事項 | 優先度 |
| --- | --- | --- | --- |
| **個人情報保護法（日本）** | 適用（個人情報取扱事業者） | プライバシーポリシー、利用目的の特定・通知、第三者提供制限（Anthropic への送信は委託 or 提供の整理）、安全管理措置、漏えい時報告（§8.4）、開示・訂正・削除請求対応 | Must |
| **GDPR**（将来 EU 展開） | 居住者がいなければ非適用、提供時は適用 | DPA 締結、DPO 検討、データマッピング、72h 通知、データポータビリティ、忘れられる権利、SCC for 越境移転 | Should（海外展開判断時に Must） |
| **CCPA/CPRA**（米加州） | 同上 | "Do Not Sell" リンク、年次データレポート | Nice |
| **PCI DSS** | カード番号を保管しない場合は SAQ-A | Stripe 等の PCI Level 1 PSP に決済 UI を委譲（Stripe Elements / Checkout）、カード番号を kakebo サーバー・DB・ログに残さない。**カード利用「履歴」（明細）はカード番号本体を含まない場合 PCI 範囲外** | Must |
| **電気通信事業法**（外部送信規律） | 適用の可能性 | Cookie / 外部送信先の通知（プライバシーポリシーで開示） | Must |
| **資金決済法・割賦販売法** | kakebo が決済代行・後払いを行わない限り非適用 | 機能追加時に再評価 | — |
| **業界基準**: ISO 27001 / SOC 2 | 取得は Nice、ベンダー要請で必要になったら | 統制設計を ISO/SOC 2 互換に | Nice |

DPIA / リスクアセスメントを毎年実施。Should。

---

## 10. セキュリティテスト計画

### 10.1 SAST（静的解析）（Must）
- **Semgrep**（OSS ルール + 自社ルール）を CI で必須実行。
- TypeScript/React 向けに `eslint-plugin-security`、`eslint-plugin-react-security`。
- シークレットスキャン: gitleaks（pre-commit + CI）、GitHub Secret Scanning。
- IaC スキャン: `tfsec` / `checkov`。

### 10.2 DAST（動的解析）（Should）
- **OWASP ZAP** ベースライン + フルスキャンをステージングで週次。
- 認証付きスキャンの設定（セッショントークン）。
- API スキーマ（OpenAPI）ベースのファジング（`schemathesis`）。

### 10.3 SCA / コンテナ（Must）
- `npm audit` + Snyk または GitHub Advanced Security。
- コンテナイメージ: `trivy` を CI で、critical/high で fail。

### 10.4 ペネトレーションテスト（Must / Should）
- **GA 前**に外部ベンダーによる本番相当環境へのペンテスト（Web + API）。Must。
- 重大変更（認証基盤刷新、新サービス追加）ごとに再実施。Should。
- 範囲: 認証、認可（IDOR / テナント越境）、CSV/画像アップロード、AI プロンプト経由の SSRF/データ漏洩、課金 Webhook。

### 10.5 バグバウンティ（Should / Nice）
- まず **Vulnerability Disclosure Policy（VDP）** を公開（`/.well-known/security.txt`）。Should。
- 成熟後に HackerOne / Intigriti でプライベートプログラム → パブリックへ段階移行。Nice。

### 10.6 その他
- **脅威モデリング更新**: 新機能ごとに STRIDE を見直し、PR レビュー時にチェックリスト適用。Must。
- **セキュリティトレーニング**: 開発者向けに四半期 1 回。Should。
- **レッドチーム演習 / TTX（机上演習）**: 年 1 回。Nice。

---

## 付録 A: GA 前 Must チェックリスト（抜粋）

- [ ] Anthropic API キーの localStorage 平文保存を廃止（バックエンドプロキシ化）
- [ ] `anthropic-dangerous-direct-browser-calls` の使用停止
- [ ] CSP / HSTS / セキュリティヘッダ一式
- [ ] DB 全体暗号化 + フィールドレベル暗号化（金融情報）
- [ ] PostgreSQL RLS によるテナント分離
- [ ] Argon2id パスワードハッシュ + MFA
- [ ] Stripe 等への決済委譲（PCI 範囲縮小）
- [ ] CSV/画像アップロードのバリデーション・サニタイズ
- [ ] Dependabot / npm audit / gitleaks を CI で必須化
- [ ] プライバシーポリシー・外部送信通知・漏えい時報告フロー
- [ ] ログから PII/シークレットを除去
- [ ] 外部ペネトレーションテスト合格
