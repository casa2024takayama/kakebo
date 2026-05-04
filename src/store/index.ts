import { create } from 'zustand'
import { storage, runMigrationV03 } from '../lib/storage'
import type { TimelineFilter } from '../lib/storage'
import { currentMonthKey } from '../lib/budget'

/** Timeline: ユーザーが選べるカードの上限（UI 仕様に基づく） */
export const TIMELINE_VISIBLE_CARDS_MAX = 10
/** Timeline: 初期状態で全表示にするカード枚数の閾値 */
export const TIMELINE_INITIAL_VISIBLE_THRESHOLD = 2
/** Timeline: 閾値を超えたとき、初期状態で先頭から見せる枚数 */
export const TIMELINE_INITIAL_VISIBLE_HEAD = 2

// Sprint1: 起動時マイグレーション（idempotent）
const migrationResult = runMigrationV03()
if (migrationResult.hasBulkRecords && !storage.getWarnedMixedDates()) {
  // bulk レコードがあるユーザーは date が引落日に上書きされている可能性がある。
  // ブラウザで簡易トースト相当のログ＋setTimeout で alert は鬱陶しいので、
  // 1 度だけ console と一時バナー（main から拾う）をトリガーする目的でフラグだけ立てる。
  // UI 側で表示するため warned フラグはまだ立てない（Layout 等で表示後に立てる）
}
import type {
  Category,
  Transaction,
  FixedCost,
  Settings,
  BillingGroup,
  Card,
} from '../types'

type Store = {
  categories: Category[]
  transactions: Transaction[]
  fixedCosts: FixedCost[]
  settings: Settings
  billingGroups: BillingGroup[]
  cards: Card[]

  setCategories: (v: Category[]) => void
  setTransactions: (v: Transaction[]) => void
  addTransaction: (t: Omit<Transaction, 'id'>) => void
  addTransactions: (ts: Omit<Transaction, 'id'>[]) => void
  deleteTransaction: (id: string) => void
  setFixedCosts: (v: FixedCost[]) => void
  setSettings: (v: Settings) => void
  applyFixedCostsIfNeeded: () => void

  setBillingGroups: (v: BillingGroup[]) => void
  upsertBillingGroup: (g: BillingGroup) => void
  addBillingGroup: (g: Omit<BillingGroup, 'id'>) => string
  deleteBillingGroup: (id: string) => void

  updateTransaction: (t: Transaction) => void

  setCards: (v: Card[]) => void
  addCard: (c: Omit<Card, 'id'>) => string
  updateCard: (c: Card) => void
  deleteCard: (id: string) => void

  /** Timeline: 表示フィルタ */
  timelineFilter: TimelineFilter
  /**
   * 表示するカードIDの配列を設定。
   * - 上限 TIMELINE_VISIBLE_CARDS_MAX を超えると false を返す（呼出側でトースト等の警告を）
   * - 上限以内なら永続化して true を返す
   */
  setTimelineVisibleCardIds: (ids: string[]) => boolean
  /** カード単体の表示/非表示をトグル。上限超過時は false を返す */
  toggleTimelineCardVisibility: (cardId: string) => boolean
  /** タイムライン上で見えるか（フィルタ適用後）。フィルタ未設定なら初期ルール適用 */
  isCardVisibleInTimeline: (cardId: string) => boolean
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useStore = create<Store>((set, get) => ({
  categories: storage.getCategories(),
  transactions: storage.getTransactions(),
  fixedCosts: storage.getFixedCosts(),
  settings: storage.getSettings(),
  billingGroups: storage.getBillingGroups(),
  cards: storage.getCards(),

  setCategories: (categories) => {
    storage.saveCategories(categories)
    set({ categories })
  },

  setTransactions: (transactions) => {
    storage.saveTransactions(transactions)
    set({ transactions })
  },

  addTransaction: (t) => {
    const transactions = [...get().transactions, { ...t, id: uid() }]
    storage.saveTransactions(transactions)
    set({ transactions })
  },

  addTransactions: (ts) => {
    const transactions = [...get().transactions, ...ts.map((t) => ({ ...t, id: uid() }))]
    storage.saveTransactions(transactions)
    set({ transactions })
  },

  deleteTransaction: (id) => {
    const transactions = get().transactions.filter((t) => t.id !== id)
    storage.saveTransactions(transactions)
    set({ transactions })
  },

  setFixedCosts: (fixedCosts) => {
    storage.saveFixedCosts(fixedCosts)
    set({ fixedCosts })
  },

  setSettings: (settings) => {
    storage.saveSettings(settings)
    set({ settings })
  },

  applyFixedCostsIfNeeded: () => {
    const monthKey = currentMonthKey()
    const last = storage.getLastFixedApplied()
    if (last === monthKey) return
    const { fixedCosts, addTransactions } = get()
    if (fixedCosts.length === 0) return
    addTransactions(
      fixedCosts.map((fc) => ({
        amount: fc.amount,
        categoryId: fc.categoryId,
        memo: fc.name,
        date: `${monthKey}-${String(fc.day).padStart(2, '0')}`,
        source: 'manual' as const,
      })),
    )
    storage.saveLastFixedApplied(monthKey)
    console.log(`固定費を${monthKey}に自動計上しました`)
  },

  setBillingGroups: (billingGroups) => {
    storage.saveBillingGroups(billingGroups)
    set({ billingGroups })
  },

  upsertBillingGroup: (g) => {
    const existing = get().billingGroups
    const next = existing.some((x) => x.id === g.id)
      ? existing.map((x) => (x.id === g.id ? g : x))
      : [...existing, g]
    storage.saveBillingGroups(next)
    set({ billingGroups: next })
  },

  addBillingGroup: (g) => {
    const id = uid()
    const next = [...get().billingGroups, { ...g, id }]
    storage.saveBillingGroups(next)
    set({ billingGroups: next })
    return id
  },

  deleteBillingGroup: (id) => {
    const billingGroups = get().billingGroups.filter((g) => g.id !== id)
    // 紐付くカードも削除
    const cards = get().cards.filter((c) => c.billingGroupId !== id)
    storage.saveBillingGroups(billingGroups)
    storage.saveCards(cards)
    set({ billingGroups, cards })
  },

  updateTransaction: (t) => {
    const transactions = get().transactions.map((x) => (x.id === t.id ? t : x))
    storage.saveTransactions(transactions)
    set({ transactions })
  },

  setCards: (cards) => {
    storage.saveCards(cards)
    set({ cards })
  },

  addCard: (c) => {
    const id = uid()
    const cards = [...get().cards, { ...c, id }]
    storage.saveCards(cards)
    set({ cards })
    return id
  },

  updateCard: (c) => {
    const cards = get().cards.map((x) => (x.id === c.id ? c : x))
    storage.saveCards(cards)
    set({ cards })
  },

  deleteCard: (id) => {
    const cards = get().cards.filter((c) => c.id !== id)
    storage.saveCards(cards)
    // 削除されたカードはフィルタからも除外
    const f = get().timelineFilter
    if (f.visibleCardIds) {
      const next: TimelineFilter = {
        visibleCardIds: f.visibleCardIds.filter((cid) => cid !== id),
      }
      storage.saveTimelineFilter(next)
      set({ cards, timelineFilter: next })
    } else {
      set({ cards })
    }
  },

  timelineFilter: storage.getTimelineFilter(),

  setTimelineVisibleCardIds: (ids) => {
    if (ids.length > TIMELINE_VISIBLE_CARDS_MAX) return false
    const next: TimelineFilter = { visibleCardIds: ids }
    storage.saveTimelineFilter(next)
    set({ timelineFilter: next })
    return true
  },

  toggleTimelineCardVisibility: (cardId) => {
    const cards = get().cards
    const f = get().timelineFilter
    // 現在の visible 集合を解決（未設定なら初期ルール）
    const current = resolveVisibleIds(f, cards)
    const isVisible = current.includes(cardId)
    const nextIds = isVisible
      ? current.filter((id) => id !== cardId)
      : [...current, cardId]
    if (nextIds.length > TIMELINE_VISIBLE_CARDS_MAX) return false
    const next: TimelineFilter = { visibleCardIds: nextIds }
    storage.saveTimelineFilter(next)
    set({ timelineFilter: next })
    return true
  },

  isCardVisibleInTimeline: (cardId) => {
    const f = get().timelineFilter
    const cards = get().cards
    return resolveVisibleIds(f, cards).includes(cardId)
  },
}))

/**
 * フィルタ＋カード一覧から、現在「タイムラインで見えている」カードIDを返す。
 * - visibleCardIds が null（未設定）なら初期ルールを適用
 *   - カード ≤ TIMELINE_INITIAL_VISIBLE_THRESHOLD: 全表示
 *   - それ以上: 先頭 TIMELINE_INITIAL_VISIBLE_HEAD 枚
 * - visibleCardIds が設定済みなら、現存カードと突き合わせて返す
 */
function resolveVisibleIds(filter: TimelineFilter, cards: Card[]): string[] {
  if (filter.visibleCardIds === null) {
    if (cards.length <= TIMELINE_INITIAL_VISIBLE_THRESHOLD) {
      return cards.map((c) => c.id)
    }
    return cards.slice(0, TIMELINE_INITIAL_VISIBLE_HEAD).map((c) => c.id)
  }
  const existingIds = new Set(cards.map((c) => c.id))
  return filter.visibleCardIds.filter((id) => existingIds.has(id))
}

/** 外部からも使えるよう export（純関数版） */
export function resolveTimelineVisibleIds(
  filter: TimelineFilter,
  cards: Card[],
): string[] {
  return resolveVisibleIds(filter, cards)
}
