import type { BillingGroup, Card, Transaction } from '../types'
import { getCycleForTransaction } from './billingCycle'

/**
 * 取引から「引落日」と「請求期間」を派生計算する。
 * Transaction には保存しない。表示時に都度呼ぶこと。
 *
 * 戻り値が null = カード未割当 or 請求グループ未紐付け（引落日無し）
 */
export function computeDerivedDates(
  t: Transaction,
  groups: BillingGroup[],
  cards: Card[],
): { withdrawalDate: string; cycleStart: string; cycleEnd: string } | null {
  if (!t.cardId) return null
  const card = cards.find((c) => c.id === t.cardId)
  if (!card) return null
  const group = groups.find((g) => g.id === card.billingGroupId)
  if (!group) return null

  let cyc: { withdrawalDate: string; cycleStart: string; cycleEnd: string }
  if (t.kind === 'bulk' && t.billingPeriod) {
    const c = getCycleForTransaction(t.billingPeriod.end, group)
    cyc = {
      withdrawalDate: c.withdrawalDate,
      cycleStart: t.billingPeriod.start,
      cycleEnd: t.billingPeriod.end,
    }
  } else if (t.kind === 'bulk' && t.billingMonth) {
    cyc = getCycleForTransaction(`${t.billingMonth}-15`, group)
  } else {
    cyc = getCycleForTransaction(t.date, group)
  }

  // v0.4.3: actualWithdrawalDate があれば理論計算より優先（CSVのメタデータからの実引落日）
  if (t.actualWithdrawalDate) {
    return { ...cyc, withdrawalDate: t.actualWithdrawalDate }
  }
  return cyc
}

// ============================================================
// 長期表示対応：範囲内の全引落予定を返す
// ============================================================

export type WithdrawalEntry = {
  /** 引落日 (YYYY-MM-DD) */
  withdrawalDate: string
  /** 請求期間開始 */
  cycleStart: string
  /** 請求期間終了 */
  cycleEnd: string
  /** カードID */
  cardId: string
  /** 請求グループID */
  groupId: string
  /** 引落対象の取引（同一カード×同一引落日で集約済） */
  transactions: Transaction[]
  /** 合計額 */
  total: number
}

function isoBetween(iso: string, startISO: string, endISO: string): boolean {
  return iso >= startISO && iso <= endISO
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/**
 * 指定範囲（startDate 〜 endDate, 両端含む）に引落日が入る
 * 引落予定を、カード×引落日で集約して返す。
 *
 * - O(transactions) で走査
 * - 同じ (cardId, withdrawalDate) は1エントリに集約
 * - excludeFromWithdrawal=true は除外
 * - cardId 未割当 / グループ未紐付けは除外
 */
export function getAllWithdrawalsInRange(
  transactions: Transaction[],
  cards: Card[],
  groups: BillingGroup[],
  startDate: Date,
  endDate: Date,
): WithdrawalEntry[] {
  const startISO = dateToISO(startDate)
  const endISO = dateToISO(endDate)
  const map = new Map<string, WithdrawalEntry>()

  for (const t of transactions) {
    if (!t.cardId) continue
    if (t.excludeFromWithdrawal) continue
    const card = cards.find((c) => c.id === t.cardId)
    if (!card) continue
    const derived = computeDerivedDates(t, groups, cards)
    if (!derived) continue
    if (!isoBetween(derived.withdrawalDate, startISO, endISO)) continue

    const key = `${card.id}|${derived.withdrawalDate}`
    const existing = map.get(key)
    if (existing) {
      existing.transactions.push(t)
      existing.total += t.amount
    } else {
      map.set(key, {
        withdrawalDate: derived.withdrawalDate,
        cycleStart: derived.cycleStart,
        cycleEnd: derived.cycleEnd,
        cardId: card.id,
        groupId: card.billingGroupId,
        transactions: [t],
        total: t.amount,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.withdrawalDate.localeCompare(b.withdrawalDate),
  )
}
