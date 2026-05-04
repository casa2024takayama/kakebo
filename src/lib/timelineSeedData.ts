/**
 * Timeline 開発用シードデータ
 *
 * 用途：リッチ化されたタイムラインUIの動作確認に使う見本データ。
 * 本番環境では絶対に走らせない（import.meta.env.DEV ガード必須）。
 *
 * 提供データ：
 * - 請求グループ × 4
 * - カード × 10
 * - 取引：過去6ヶ月 + 未来12ヶ月（合計18ヶ月）にわたって生成
 *   ・個別取引（kind: 'individual'）：カードごとにランダム頻度
 *   ・請求一括（kind: 'bulk'）：請求期間ごとに 1 件
 */

import type {
  BillingGroup,
  Card,
  Transaction,
  Category,
} from '../types'

if (!import.meta.env.DEV) {
  // 本番ビルドに紛れ込んだ場合の保険：呼び出されても何もしない実装に差し替え可能。
  // ここでは静的に warning だけ。実際の generate 関数内で再度ガードする。
  // eslint-disable-next-line no-console
  console.warn('[timelineSeedData] loaded in non-DEV build')
}

export type TimelineDemo = {
  groups: BillingGroup[]
  cards: Card[]
  transactions: Omit<Transaction, 'id'>[]
  /** 任意の補助カテゴリ（既存カテゴリと衝突しない id） */
  categories: Category[]
}

/** 簡易シード PRNG（mulberry32）：再現性のため固定シード */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDay(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

const CATEGORY_IDS = [
  'food',
  'transport',
  'daily',
  'entertainment',
  'clothing',
  'other',
] as const

const CARD_DEFS: Array<{ name: string; groupKey: string; color: string }> = [
  { name: 'PayPayカード', groupKey: 'paypay', color: '#FF0033' },
  { name: 'PayPayゴールド', groupKey: 'paypay', color: '#D40028' },
  { name: 'セゾンパール', groupKey: 'saison', color: '#0E4DA4' },
  { name: 'セゾンアメックス', groupKey: 'saison', color: '#1A6B4A' },
  { name: 'イオンカード', groupKey: 'aeon', color: '#E5972A' },
  { name: 'イオンゴールド', groupKey: 'aeon', color: '#D4801D' },
  { name: 'JCB W', groupKey: 'jcb', color: '#005BAC' },
  { name: 'JCB ザ・クラス', groupKey: 'jcb', color: '#7F8C8D' },
  { name: 'Visaデビット', groupKey: 'paypay', color: '#8E44AD' },
  { name: '楽天カード', groupKey: 'jcb', color: '#BF0000' },
]

const GROUP_DEFS: Array<{
  key: string
  group: Omit<BillingGroup, 'id'>
}> = [
  {
    key: 'paypay',
    group: { name: 'PayPayカード', closingDay: 'last', withdrawalDay: 27 },
  },
  {
    key: 'saison',
    group: { name: 'セゾン', closingDay: 10, withdrawalDay: 4 },
  },
  {
    key: 'aeon',
    group: { name: 'イオン', closingDay: 10, withdrawalDay: 2 },
  },
  {
    key: 'jcb',
    group: { name: 'JCB', closingDay: 15, withdrawalDay: 10 },
  },
]

/**
 * デモ用のタイムラインデータを生成する。
 *
 * @param today 基準日（既定：現在）
 * @returns groups / cards / transactions（id 未設定。store の addTransactions に渡す）
 */
export function generateTimelineDemo(today: Date = new Date()): TimelineDemo {
  if (!import.meta.env.DEV) {
    // 本番ビルドでは空データを返す（防御）
    return { groups: [], cards: [], transactions: [], categories: [] }
  }

  const rand = mulberry32(20260503)

  // groups
  const groups: BillingGroup[] = GROUP_DEFS.map((g) => ({
    id: `demo-grp-${g.key}`,
    ...g.group,
  }))
  const groupIdByKey = new Map(GROUP_DEFS.map((g) => [g.key, `demo-grp-${g.key}`]))

  // cards
  const cards: Card[] = CARD_DEFS.map((c, i) => ({
    id: `demo-card-${i}`,
    name: c.name,
    billingGroupId: groupIdByKey.get(c.groupKey)!,
    color: c.color,
  }))

  // 期間：過去6ヶ月 〜 未来12ヶ月
  const start = addMonths(today, -6)
  const end = addMonths(today, 12)
  start.setDate(1)
  end.setDate(lastDay(end.getFullYear(), end.getMonth()))

  const transactions: Omit<Transaction, 'id'>[] = []

  // (1) 個別取引：各カードについて月あたり 3〜12 件
  for (const card of cards) {
    let cur = new Date(start)
    while (cur <= end) {
      const monthCount = 3 + Math.floor(rand() * 10)
      const y = cur.getFullYear()
      const m0 = cur.getMonth()
      const ld = lastDay(y, m0)
      for (let i = 0; i < monthCount; i++) {
        const day = 1 + Math.floor(rand() * ld)
        const amount = 200 + Math.floor(rand() * 12000)
        const cat = CATEGORY_IDS[Math.floor(rand() * CATEGORY_IDS.length)]
        transactions.push({
          amount,
          categoryId: cat,
          memo: `${card.name} デモ利用`,
          date: `${y}-${pad2(m0 + 1)}-${pad2(day)}`,
          source: 'manual',
          cardId: card.id,
          kind: 'individual',
        })
      }
      cur = addMonths(cur, 1)
    }
  }

  // (2) 請求一括：各カードの月ごとに 1 件（amount は 10k〜80k）
  for (const card of cards) {
    let cur = new Date(start)
    while (cur <= end) {
      const y = cur.getFullYear()
      const m0 = cur.getMonth()
      const ld = lastDay(y, m0)
      const amount = 10000 + Math.floor(rand() * 70000)
      transactions.push({
        amount,
        categoryId: 'other',
        memo: `${card.name} 一括請求デモ`,
        date: `${y}-${pad2(m0 + 1)}-${pad2(ld)}`,
        source: 'manual',
        cardId: card.id,
        kind: 'bulk',
        billingPeriod: {
          start: `${y}-${pad2(m0 + 1)}-01`,
          end: `${y}-${pad2(m0 + 1)}-${pad2(ld)}`,
        },
        // 個別取引と二重計上しないよう、デモでは一括側を引落計算から除外
        excludeFromWithdrawal: true,
      })
      cur = addMonths(cur, 1)
    }
  }

  return {
    groups,
    cards,
    transactions,
    categories: [],
  }
}

/** 生成サマリ（コンソールログ用） */
export function summarizeTimelineDemo(d: TimelineDemo): string {
  return `[timelineSeedData] groups=${d.groups.length}, cards=${d.cards.length}, txs=${d.transactions.length}`
}
