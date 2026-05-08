import type { BillingGroup, Card, Transaction } from '../types'
import { getCycleForTransaction, getCycleByWithdrawalDate } from './billingCycle'

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
  // v0.4.18: カード未割当（現金・ローン・サブスク等）は「利用日＝引落日」として扱う
  if (!t.cardId) {
    return {
      cycleStart: t.date,
      cycleEnd: t.date,
      withdrawalDate: t.actualWithdrawalDate ?? t.date,
    }
  }
  const card = cards.find((c) => c.id === t.cardId)
  if (!card) {
    return {
      cycleStart: t.date,
      cycleEnd: t.date,
      withdrawalDate: t.actualWithdrawalDate ?? t.date,
    }
  }
  const group = groups.find((g) => g.id === card.billingGroupId)
  if (!group) {
    return {
      cycleStart: t.date,
      cycleEnd: t.date,
      withdrawalDate: t.actualWithdrawalDate ?? t.date,
    }
  }

  // v0.4.6: actualWithdrawalDate があれば、引落日と請求期間の両方を実引落日から逆算する。
  // billingMonth/billingPeriod から「次サイクル」を理論計算してしまう問題を解消。
  if (t.actualWithdrawalDate) {
    return getCycleByWithdrawalDate(t.actualWithdrawalDate, group)
  }

  if (t.kind === 'bulk' && t.billingPeriod) {
    const c = getCycleForTransaction(t.billingPeriod.end, group)
    return {
      withdrawalDate: c.withdrawalDate,
      cycleStart: t.billingPeriod.start,
      cycleEnd: t.billingPeriod.end,
    }
  }
  if (t.kind === 'bulk' && t.billingMonth) {
    return getCycleForTransaction(`${t.billingMonth}-15`, group)
  }
  return getCycleForTransaction(t.date, group)
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

  // v0.4.36: bulkカバレッジ自動検出（多重ソース）
  // 各bulkは以下から coverage period を生成:
  //   1. computeDerivedDates 由来（actualWithdrawalDate 優先のサイクル）
  //   2. billingMonth 由来（理論サイクル）
  //   3. billingPeriod 由来（明示設定）
  // データ不整合（例: 古いbulkのactualWithdrawalDateが間違っている）にも対応するため複数登録。
  const bulkCoverage = new Map<string, Array<{ start: string; end: string }>>()
  for (const t of transactions) {
    if (t.kind !== 'bulk') continue
    if (t.excludeFromWithdrawal) continue
    if (!t.cardId) continue
    const card = cards.find((c) => c.id === t.cardId)
    const group = card ? groups.find((g) => g.id === card.billingGroupId) : null
    const periods: Array<{ start: string; end: string }> = []
    const d = computeDerivedDates(t, groups, cards)
    if (d) periods.push({ start: d.cycleStart, end: d.cycleEnd })
    if (group && t.billingMonth) {
      const c = getCycleForTransaction(`${t.billingMonth}-15`, group)
      periods.push({ start: c.cycleStart, end: c.cycleEnd })
    }
    if (t.billingPeriod) {
      periods.push({ start: t.billingPeriod.start, end: t.billingPeriod.end })
    }
    if (periods.length > 0) {
      const arr = bulkCoverage.get(t.cardId) ?? []
      arr.push(...periods)
      bulkCoverage.set(t.cardId, arr)
    }
  }

  for (const t of transactions) {
    if (t.excludeFromWithdrawal) continue
    if (t.kind === 'income') continue // v0.4.29: 収入は引落集計に含めない
    // v0.4.36: bulkに覆われた個別取引はスキップ（フラグ漏れの安全網）
    if (t.kind !== 'bulk' && t.cardId) {
      const periods = bulkCoverage.get(t.cardId)
      if (periods?.some((p) => t.date >= p.start && t.date <= p.end)) {
        continue
      }
    }
    const derived = computeDerivedDates(t, groups, cards)
    if (!derived) continue
    if (!isoBetween(derived.withdrawalDate, startISO, endISO)) continue

    // v0.4.19: 非カード取引（住宅ローン・サブスク等）も含める。各取引を独立したエントリで保持。
    if (!t.cardId) {
      map.set(`cash:${t.id}`, {
        withdrawalDate: derived.withdrawalDate,
        cycleStart: derived.cycleStart,
        cycleEnd: derived.cycleEnd,
        cardId: '',
        groupId: '',
        transactions: [t],
        total: t.amount,
      })
      continue
    }
    const card = cards.find((c) => c.id === t.cardId)
    if (!card) continue

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
