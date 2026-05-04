import { create } from 'zustand'
import { storage, runMigrationV03 } from '../lib/storage'
import { currentMonthKey } from '../lib/budget'

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
    set({ cards })
  },
}))
