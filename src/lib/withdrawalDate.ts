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

  if (t.kind === 'bulk' && t.billingPeriod) {
    const cyc = getCycleForTransaction(t.billingPeriod.end, group)
    return {
      withdrawalDate: cyc.withdrawalDate,
      cycleStart: t.billingPeriod.start,
      cycleEnd: t.billingPeriod.end,
    }
  }
  if (t.kind === 'bulk' && t.billingMonth) {
    const cyc = getCycleForTransaction(`${t.billingMonth}-15`, group)
    return cyc
  }
  return getCycleForTransaction(t.date, group)
}
