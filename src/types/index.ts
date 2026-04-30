export type Category = {
  id: string
  name: string
  budget: number
  color: string
}

export type Transaction = {
  id: string
  amount: number
  categoryId: string
  memo: string
  date: string
  source: 'manual' | 'csv' | 'receipt'
}

export type FixedCost = {
  id: string
  name: string
  amount: number
  categoryId: string
  day: number
}

export type Settings = {
  anthropicApiKey: string
  darkMode: boolean
}

export type MonthKey = string // "2026-04"
