import { create } from 'zustand'
import { storage } from '../lib/storage'
import { currentMonthKey } from '../lib/budget'
import type { Category, Transaction, FixedCost, Settings } from '../types'

type Store = {
  categories: Category[]
  transactions: Transaction[]
  fixedCosts: FixedCost[]
  settings: Settings

  setCategories: (v: Category[]) => void
  addTransaction: (t: Omit<Transaction, 'id'>) => void
  addTransactions: (ts: Omit<Transaction, 'id'>[]) => void
  deleteTransaction: (id: string) => void
  setFixedCosts: (v: FixedCost[]) => void
  setSettings: (v: Settings) => void
  applyFixedCostsIfNeeded: () => void
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useStore = create<Store>((set, get) => ({
  categories: storage.getCategories(),
  transactions: storage.getTransactions(),
  fixedCosts: storage.getFixedCosts(),
  settings: storage.getSettings(),

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
    const today = new Date()
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
}))
