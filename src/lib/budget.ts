import type { Transaction, Category } from '../types'

export function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthTransactions(transactions: Transaction[], monthKey: string): Transaction[] {
  return transactions.filter((t) => t.date.startsWith(monthKey))
}

export function spentByCategory(transactions: Transaction[], monthKey: string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const t of monthTransactions(transactions, monthKey)) {
    result[t.categoryId] = (result[t.categoryId] ?? 0) + t.amount
  }
  return result
}

export function totalBudget(categories: Category[]): number {
  return categories.reduce((sum, c) => sum + c.budget, 0)
}

export function totalSpent(transactions: Transaction[], monthKey: string): number {
  return monthTransactions(transactions, monthKey).reduce((sum, t) => sum + t.amount, 0)
}

export function remainingDaysInMonth(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return lastDay - now.getDate() + 1
}

export function todayBudget(remaining: number): number {
  const days = remainingDaysInMonth()
  return days > 0 ? Math.floor(remaining / days) : 0
}
