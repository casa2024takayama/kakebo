import type {
  BillingGroup,
  Card,
  Transaction,
  BillingCycle,
  WithdrawalForecast,
  MonthlyDeficit,
} from '../types'
import { getCycleForTransaction } from './billingCycle'

function cardToGroup(cards: Card[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of cards) m.set(c.id, c.billingGroupId)
  return m
}

/**
 * 取引を「グループ × サイクル（withdrawalDate）」で集計し、
 * 次回引落日が近い順に返す。
 */
export function getUpcomingWithdrawals(
  transactions: Transaction[],
  groups: BillingGroup[],
  cards: Card[],
  today: Date = new Date(),
): WithdrawalForecast[] {
  const c2g = cardToGroup(cards)
  // groupId -> withdrawalDate -> { start, end, total }
  const buckets = new Map<string, Map<string, BillingCycle>>()

  for (const t of transactions) {
    if (!t.cardId) continue
    const groupId = c2g.get(t.cardId)
    if (!groupId) continue
    const group = groups.find((g) => g.id === groupId)
    if (!group) continue
    const cyc = getCycleForTransaction(t.date, group)
    let g = buckets.get(groupId)
    if (!g) {
      g = new Map()
      buckets.set(groupId, g)
    }
    const existing = g.get(cyc.withdrawalDate)
    if (existing) {
      existing.total += t.amount
    } else {
      g.set(cyc.withdrawalDate, {
        groupId,
        cycleStart: cyc.cycleStart,
        cycleEnd: cyc.cycleEnd,
        withdrawalDate: cyc.withdrawalDate,
        total: t.amount,
      })
    }
  }

  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(today.getDate()).padStart(2, '0')}`

  // 各グループから「今日以降の最も近い1件」を抽出
  const result: WithdrawalForecast[] = []
  for (const group of groups) {
    const g = buckets.get(group.id)
    let pick: BillingCycle | undefined
    if (g) {
      const upcoming = Array.from(g.values())
        .filter((c) => c.withdrawalDate >= todayISO)
        .sort((a, b) => a.withdrawalDate.localeCompare(b.withdrawalDate))
      pick = upcoming[0]
    }
    if (pick) {
      result.push({ group, cycle: pick })
    } else {
      // 取引が無いグループは total=0 で次回サイクル枠を提示
      const cyc = getCycleForTransaction(todayISO, group)
      // 引落日が過去なら翌サイクルへ
      const cycle: BillingCycle =
        cyc.withdrawalDate >= todayISO
          ? { groupId: group.id, ...cyc, total: 0 }
          : (() => {
              // 翌サイクル
              const [y, m, d] = cyc.cycleEnd.split('-').map(Number)
              const next = new Date(y, m - 1, d + 1)
              const nextISO = `${next.getFullYear()}-${String(
                next.getMonth() + 1,
              ).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
              const nc = getCycleForTransaction(nextISO, group)
              return { groupId: group.id, ...nc, total: 0 }
            })()
      result.push({ group, cycle })
    }
  }
  return result.sort((a, b) =>
    a.cycle.withdrawalDate.localeCompare(b.cycle.withdrawalDate),
  )
}

/**
 * 当月（カレンダー月）に引落予定のある合計と、収入との差分。
 */
export function getMonthlyDeficit(
  transactions: Transaction[],
  groups: BillingGroup[],
  cards: Card[],
  monthlyIncome: number,
  targetMonth: Date = new Date(),
): MonthlyDeficit {
  const c2g = cardToGroup(cards)
  const yyyymm = `${targetMonth.getFullYear()}-${String(
    targetMonth.getMonth() + 1,
  ).padStart(2, '0')}`

  let totalOut = 0
  for (const t of transactions) {
    if (!t.cardId) {
      // 現金/未割当は当月利用日基準で当月キャッシュフロー扱い
      if (t.date.startsWith(yyyymm)) totalOut += t.amount
      continue
    }
    const groupId = c2g.get(t.cardId)
    if (!groupId) {
      if (t.date.startsWith(yyyymm)) totalOut += t.amount
      continue
    }
    const group = groups.find((g) => g.id === groupId)
    if (!group) continue
    const cyc = getCycleForTransaction(t.date, group)
    if (cyc.withdrawalDate.startsWith(yyyymm)) {
      totalOut += t.amount
    }
  }

  const income = Math.max(0, Math.floor(monthlyIncome || 0))
  const balance = income - totalOut

  let status: 'green' | 'yellow' | 'red' = 'green'
  if (income > 0) {
    const ratio = totalOut / income
    if (balance < 0) status = 'red'
    else if (ratio > 0.85) status = 'yellow'
    else status = 'green'
  } else {
    // 収入未設定時は支出があれば黄、無ければ緑
    status = totalOut > 0 ? 'yellow' : 'green'
  }

  return { totalOut, income, balance, status }
}
