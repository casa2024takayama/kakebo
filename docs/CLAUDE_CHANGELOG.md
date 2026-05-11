# Claude Code 変更履歴

Claude Code / Cursor の併用開発における、Claude Code参照用の統合履歴。  
更新ルールは `docs/AI_COLLAB_RULES.md` の「6. Claude Code向け変更履歴（必須運用）」に従う。

---

## 2026-05-11 17:35 JST
- 担当AI: Cursor
- バージョン: v0.4.38
- 概要:
  - テスト用バックアップJSONを追加し、固定費マスタと同月同額の取引が重複しないよう内容を調整
  - `validate:test-data` 実行で重複なし・引落計算サマリ整合を確認
- 影響範囲:
  - `docs/test-data/kakebo_backup_dummy_v2.json`
  - `scripts/validate-test-data.mjs`
  - `package.json`
- 検証結果:
  - `npm run validate:test-data` 成功（Duplicate 0）

## 2026-05-08 23:10 JST
- 担当AI: Cursor
- バージョン: v0.4.38
- 概要:
  - テスト用バックアップJSONの整合チェックを自動化する `validate:test-data` スクリプトを追加
  - 重複（memo+amount+date）検出と、引落計算対象/記録のみ/収入の金額サマリを出力可能にした
- 影響範囲:
  - `scripts/validate-test-data.mjs`
  - `package.json`
- 検証結果:
  - `npm run validate:test-data` 成功（重複0件）

## 2026-05-08 22:56 JST
- 担当AI: Cursor
- バージョン: v0.4.38
- 概要:
  - AEONの支払日未記載CSVで、明細の最大利用日から理論引落日を推定する処理を追加
  - 推定引落日を個別明細と請求一括（bulk）に共通付与して dedup 文脈を統一
- 影響範囲:
  - `src/pages/Import.tsx`
  - `package.json`
  - `package-lock.json`
- 検証結果:
  - `npm run build` 成功

## 2026-05-08 22:48 JST
- 担当AI: Cursor
- バージョン: v0.4.37
- 概要:
  - 引落集計ロジックを共通化し、Dashboard/Cashflow の dedup 結果を揃える修正を反映
  - CSV負数行を返金収入（`kind: 'income'`）として扱う運用へ変更
  - Claude Code + Cursor の協調実装ルールを文書化
- 影響範囲:
  - `src/lib/withdrawalDate.ts`
  - `src/lib/forecast.ts`
  - `src/lib/csv.ts`
  - `docs/AI_COLLAB_RULES.md`
  - `CLAUDE.md`
  - `package.json`
  - `package-lock.json`
- 検証結果:
  - `npm run build` 成功

## 2026-05-08 22:13 JST
- 担当AI: Cursor
- バージョン: docs update
- 概要:
  - AIと人間双方が参照しやすい `システム仕様書.md` を追加
- 影響範囲:
  - `システム仕様書.md`
- 検証結果:
  - ドキュメント追加のためビルド影響なし
