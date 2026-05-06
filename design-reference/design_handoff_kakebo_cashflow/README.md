# Handoff: 家計簿 Cashflow Calendar

## Overview

クレジットカード請求と給料を統合した家計キャッシュフロー可視化アプリ。複数のクレジットカード（4〜6枚）の利用期間・締め日・引落日を一元管理し、月次の口座残高推移を予測する。

主なユースケース:
- 「次の引落で口座が足りるか」を即座に判断
- 月末の予測残高を把握して支出を調整
- 各カードの今月利用額をリアルタイムに把握

## About the Design Files

このバンドル内のファイルは **HTMLで作られたデザインリファレンス** です — 完成形の見た目とインタラクションを示すプロトタイプであり、そのままプロダクションに投入するコードではありません。

タスクは、対象リポジトリ（https://github.com/casa2024takayama/kakebo）の既存の技術スタック（React/Vue/Next.js等、`package.json` を確認）と確立されたパターンに従って、これらのHTMLデザインを**再実装する**ことです。環境がまだない場合は、プロジェクトに最も適したフレームワークを選んで実装してください。

## Fidelity

**High-fidelity (hifi)** — ピクセルパーフェクトな最終モックです。色・タイポグラフィ・スペーシング・インタラクションは確定値として扱ってください。既存ライブラリ（Tailwind / shadcn/ui / Material UI 等）に置き換える場合も、これらのトークン値に近づけてください。

## Screens / Views

このプロトタイプには **2つのデザインバージョン** が含まれています:

### 1. Kakebo Cashflow.html （**メイン / 推奨実装**）
3ペインの「キャッシュフロー中心」レイアウト。

#### Purpose
ユーザーが「いつ・いくら・口座にお金が残るか」を一目で判断できる。

#### Layout
CSS Grid: `gridTemplateColumns: '300px 1fr 340px'`、`gridTemplateRows: 'auto 1fr auto'`

```
┌─────────────────────────────────────────┐
│ ヘッダー（年月 / 月送り）                │
├─────────┬───────────────────┬───────────┤
│ 左サマリー│ 中央カレンダー    │ 右リスト  │
│  300px  │  カード使用率パネル │  340px    │
└─────────┴───────────────────┴───────────┘
```

#### Components

**ヘッダー**
- 高さ: auto（`padding: 18px 28px`）
- 背景: `#ffffff`、下境界: `1px solid #e7decd`
- 左: 「家計簿 / Cashflow」ラベル + 「YYYY年 N月」（22px / 700）
- 右: `‹` `今月` `›` ボタン群（gap: 6px）

**左ペイン（サマリー / 4ブロック）**
背景: `#ffffff`、右境界: `1px solid #e7decd`、`padding: 20px 22px`、`gap: 22px`

1. **今日の口座残高**
   - ラベル: `font-size: 9.5px / 700 / letter-spacing: 0.12em / uppercase / color: #7a6d5e`
   - 数値: `font-size: 36px / 700 / tabular-nums / letter-spacing: -0.03em / color: #1a1410`
   - 補足: `5/4(月) 時点`

2. **次の引落**
   - 数値: `26px / 700`、色 = カードカラー（例: AEONなら `#9d3a4a`）
   - 補足: `5/10(日) · AEONカード`

3. **確定済 · 引落待ち合計**
   - 数値: `22px / 700 / color: #9d3a4a`
   - 補足: `N件 · 締め済 / 未引落`

4. **月末予測残高 + 内訳**
   - 数値: `18px / 700`、`> 600,000` で `#3d6e4a`、以下で `#9d3a4a`
   - **重要:** 内訳の計算式を併記
     - `今日残高: ¥1,432,820`（黒）
     - `− 確定済引落: ¥xxx,xxx`（赤 `#9d3a4a`）
     - `+ 月内給料: ¥500,000`（緑 `#3d6e4a`）
     - 区切り線
     - `= 月末予測: ¥xxx,xxx`
   - インジケータ: `安全圏` / `警戒域 — 60万以下`

**中央ペイン（カレンダー + 利用状況）**
背景: `#f7f4ed`、`padding: 20px 22px`

- **CalendarGrid**
  - `gridTemplateColumns: repeat(7, 1fr)`、6行（42セル）
  - 曜日ヘッダー: 日曜 `#9d3a4a`、土曜 `#3a6989`、平日 `#7a6d5e`
  - セル: `min-height: 76px`、`padding: 6px 7px 4px`
  - 月外の日: `opacity: 0.32`
  - 今日: 日付に銅色バッジ `background: #b87333 / color: #ffffff`、右上に `TODAY` ラベル

- **イベント表示（セル内）**
  - 給料日 (毎月25日): 緑タグ `+¥50万` / `background: #e6efe8 / color: #3d6e4a`
  - 引落日: カードカラーのドット + 金額 `−¥xx,xxx`（複数あれば縦並び、3件超は `+ N`）
  - セル右下: 推移残高 `8.5px / #c9beac`（イベント日のみ表示）

- **「今月の利用状況」パネル**
  - 各カードの進行中サイクルの利用額 / 利用枠
  - 横棒バー（カードカラー）+ ラベル `カード名 · ¥利用額 / ¥利用枠`
  - 利用枠ロジック: SAISONは80万、それ以外は50万（リポジトリ実装時はDBから取得）

**右ペイン（確定済請求リスト）**
背景: `#ffffff`、左境界: `1px solid #e7decd`、`padding: 20px 22px`、`gap: 12px`

- ヘッダー: `確定済 · 引落待ち N件`
- **ソートコントロール（セグメントボタン）**
  - `日付順` / `金額順` の2択
  - 選択中: `background: #b87333 / color: white`
  - 非選択: `background: white / border: 1px solid #e7decd`

- **PendingBillCard**（請求カード、引落日が近い順またはamount多い順）
  - `border: 1px solid #e7decd`、`border-radius: 6px`、`padding: 14px 16px`、`gap: 10px`
  - 上段: ブランドバッジ + カード名 + `あと N日`（7日以内なら赤 `#9d3a4a`）
  - 中段: 大きな金額 `22px / 700` + 件数
  - 下段: ミニタイムライン（締め→引落の進捗バー）+ 日付
    - 進捗バー: 高さ4px、ベース `#f0e8d8`、進行 `カードカラー`
    - 進捗ノット: `width: 10px`、`border: 2px solid white`

### 2. Kakebo Timeline.html （**サブ / 構造可視化版**）

横スクロール式のカードレーンタイムライン。複数月にまたがる請求サイクルを俯瞰できる。サイクル状態（引落済 / 確定済 / 進行中 / 未開始）が視覚的に分かれる。

実装はメイン版が完了してから検討で構いません。

## Interactions & Behavior

### Cashflow画面
- **月送り**: `‹` `›` ボタン or `今月` で現月にジャンプ
- **カレンダーセル**: イベントがあるセルだけクリック可（`cursor: pointer`）。クリックで詳細モーダル/ポップオーバー（未実装）
- **ソート切り替え**: `日付順` ↔ `金額順` の即時切り替え
- **ホバー**: なし（控えめなUI）

### Timeline画面
- 横スクロール（`overflow: auto`）
- サイクルバークリックで右ペインに明細表示
- カードチップで表示/非表示切り替え

## State Management

```ts
// Cashflow画面
type State = {
  month: number;              // 0-11
  sortBy: 'date' | 'amount';
  selectedDay: Day | null;
  visibleCards: number;       // 2-6
};
```

### サイクル状態判定（**コア論理**）

**最も重要なビジネスロジック**。カードの請求サイクルは今日との関係で4状態に分かれる:

```ts
function classifyCycle(cycle, today) {
  if (cycle.pay < today)                                    return 'paid';        // 引落済
  if (cycle.close < today && cycle.pay >= today)            return 'confirmed';   // 確定済（待機中）
  if (cycle.start <= today && cycle.close >= today)         return 'open';        // 進行中
  if (cycle.start > today)                                  return 'future';      // 未開始
}
```

- **paid**: 金額確定、口座から引落済
- **confirmed**: 締め後・引落前。**この金額のみ「確定引落」として集計**
- **open**: まだ請求進行中。**今日までの取引のみ**を仮計上（最終金額ではない）
- **future**: 取引なし。金額表示しない

**重要なルール:**
> **今日以降の取引日のトランザクションは、いかなるサイクルでも集計に含めない。**

これはクレジットカードの実態（未来の取引はまだ存在しない）を反映するためのルール。

### キャッシュフロー予測

```ts
const monthEndForecast =
  todayBalance
  - sum(confirmedCyclesPayingThisMonth)
  + sum(salariesAfterToday);
```

## Design Tokens

### Colors

```ts
// Cashflow (D2)
const D2 = {
  bg: '#f7f4ed',          // ページ背景
  surface: '#ffffff',     // カード/ペイン背景
  ink: '#1a1410',         // 主要テキスト
  inkSoft: '#7a6d5e',     // セカンダリテキスト
  inkFaint: '#c9beac',    // 三次テキスト
  rule: '#e7decd',        // 主要境界線
  ruleSoft: '#f0e8d8',    // 弱い境界線
  bronze: '#b87333',      // アクセント（今日 / プライマリボタン）
  good: '#3d6e4a',        // 正の値（給料 / 安全）
  warn: '#9d3a4a',        // 負の値 / 警戒
};

// カードカラー（実装時はカードマスタから引く）
const CARDS = {
  saison:  { color: '#2c5f8d', colorBg: '#e8eff5', colorMid: '#7fa2c2' },
  aeon:    { color: '#9d3a4a', colorBg: '#f3e3e6', colorMid: '#c47a85' },
  rakuten: { color: '#bf3a2f', colorBg: '#f5e2df', colorMid: '#d6857c' },
  amex:    { color: '#3d6e4a', colorBg: '#e2ebe4', colorMid: '#85a892' },
  apple:   { color: '#26252a', colorBg: '#e2e1e5', colorMid: '#82818a' },
  jal:     { color: '#9b6a1f', colorBg: '#f1e8d3', colorMid: '#c4a36b' },
};
```

### Typography

- フォント: `'Inter', system-ui, sans-serif`
- 等幅: `'JetBrains Mono', monospace`（金額・日付など数値全般）
- 数値表示には常に `font-variant-numeric: tabular-nums; letter-spacing: -0.02em` を併用
- ラベル: `font-size: 9-10px / weight: 700 / letter-spacing: 0.1-0.14em / text-transform: uppercase`

### Spacing
基本グリッド 4px。主要値: `4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 28`

### Border Radius
- カード: `6px`
- ボタン: `4px`
- ピル/タグ: `999px`（円形）または `3px`（小さなタグ）

### Shadow
影は最小限。ペインの境界線と背景色の差で階層を作る。

## Data Schema

`source/data.jsx` のモックデータが本番スキーマの参考になります:

```ts
type Card = {
  id: string;
  name: string;          // 表示名
  short: string;         // 短縮名（フィルターチップ用）
  brand: 'VISA' | 'MASTER' | 'JCB' | 'AMEX';
  color: string;         // カードカラー（hex）
  colorBg: string;       // 薄い背景色
  colorMid: string;      // 中間色
  cycleCloseDay: number | 'end';  // 締め日
  payDay: number;        // 引落日
  payOffsetMonths: 1 | 2;         // 締めの何ヶ月後に引き落とすか
};

type Transaction = {
  card: string;          // Card.id
  date: string;          // 'YYYY-MM-DD'
  amount: number;
  merchant: string;
};
```

## Assets

外部画像は使っていません。アイコンも未使用（必要なら lucide-react などを追加してください）。

## Files

`source/` 配下:

- `Kakebo Cashflow.html` — メインデザインのエントリ
- `Kakebo Timeline.html` — タイムライン版のエントリ
- `app2.jsx` — Cashflowメインコンポーネント（**主たる実装参考**）
- `app.jsx` — Timeline版メインコンポーネント
- `timeline.jsx` — Timeline版のサイクル/レーン描画
- `data.jsx` — モックデータ + サイクル計算関数（`getCycles`, `cycleSum`, `cycleTransactions`）
- `tweaks-panel.jsx` — プロトタイプ用のチューニングパネル（**実装不要**）
- `browser-window.jsx` — プロトタイプ用ウィンドウ枠（**実装不要**）

### Claude Code への推奨指示

```
design_handoff_kakebo_cashflow/ にあるHTMLプロトタイプを参考に、
このリポジトリの技術スタック（package.json確認）に合わせて
家計簿Cashflow画面を実装してください。

優先順位:
1. data.jsx のサイクル計算ロジック（getCycles関数）の移植
2. app2.jsx の3ペインレイアウトとカレンダー
3. README.md の「サイクル状態判定」セクションのコアロジック
4. Design Tokens セクションの配色・タイポを既存テーマに統合

注意:
- 今日以降の取引は集計に含めない（クレカの実態）
- 金額表示は締め済（confirmed/paid）のサイクルのみ
- 月末予測 = 今日残高 − 確定済引落 + 月内給料
```
