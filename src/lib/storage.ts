import type { Category, Transaction, FixedCost, Settings } from '../types'

const KEYS = {
  categories: 'kakebo_categories',
  transactions: 'kakebo_transactions',
  fixedCosts: 'kakebo_fixed_costs',
  settings: 'kakebo_settings',
  lastFixedApplied: 'kakebo_last_fixed_applied',
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: '食費', budget: 40000, color: '#1A6B4A' },
  { id: 'transport', name: '交通費', budget: 15000, color: '#2980B9' },
  { id: 'daily', name: '日用品', budget: 10000, color: '#8E44AD' },
  { id: 'entertainment', name: '娯楽・交際', budget: 20000, color: '#E5972A' },
  { id: 'clothing', name: '被服', budget: 10000, color: '#E74C3C' },
  { id: 'other', name: 'その他', budget: 15000, color: '#7F8C8D' },
]

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export const storage = {
  getCategories: () => load<Category[]>(KEYS.categories, DEFAULT_CATEGORIES),
  saveCategories: (v: Category[]) => save(KEYS.categories, v),

  getTransactions: () => load<Transaction[]>(KEYS.transactions, []),
  saveTransactions: (v: Transaction[]) => save(KEYS.transactions, v),

  getFixedCosts: () => load<FixedCost[]>(KEYS.fixed_costs ?? KEYS.fixedCosts, []),
  saveFixedCosts: (v: FixedCost[]) => save(KEYS.fixedCosts, v),

  getSettings: () =>
    load<Settings>(KEYS.settings, { anthropicApiKey: '', darkMode: false }),
  saveSettings: (v: Settings) => save(KEYS.settings, v),

  getLastFixedApplied: () => load<string>(KEYS.lastFixedApplied, ''),
  saveLastFixedApplied: (v: string) => save(KEYS.lastFixedApplied, v),
}
