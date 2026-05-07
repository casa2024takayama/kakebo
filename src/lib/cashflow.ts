/**
 * v0.4.23 Cashflow画面 用ヘルパー。
 *
 * 社長指示の方針:
 * - D6: 「今日の口座残高」= settings.monthlyIncome（流用）
 * - 月末予測 = 給料日前日基準（次の給料日が来るまでに残高がプラスかどうか）
 *   → todayBalance − （今日〜給料日前日の確定済引落）= 給料日前日残高
 *   → プラスなら安全圏、マイナスなら警戒域
 *
 * サイクル状態判定（design-reference §State Management より）:
 *   paid:      引落日が今日より前
 *   confirmed: 締め後・引落前（今日∈[close+1, pay]）
 *   open:      進行中（今日∈[start, close]）
 *   future:    未開始（今日 < start）
 */

import type { BillingGroup, Card, Transaction } from '../types'
import { getAllWithdrawalsInRange, type WithdrawalEntry } from './withdrawalDate'

/** YYYY-MM-DD を Date(JST 0:00) に */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export type CycleStatus = 'paid' | 'confirmed' | 'open' | 'future'

/**
 * 取引のサイクル状態（今日との関係）を判定。
 * - cycleStart, cycleEnd, withdrawalDate は computeDerivedDates の出力
 */
export function classifyCycle(
  cycleStart: string,
  cycleEnd: string,
  withdrawalDate: string,
  todayISO: string,
): CycleStatus {
  if (withdrawalDate < todayISO) return 'paid'
  if (cycleEnd < todayISO && withdrawalDate >= todayISO) return 'confirmed'
  if (cycleStart <= todayISO && cycleEnd >= todayISO) return 'open'
  return 'future'
}

export type CashflowSummary = {
  /** 今日の口座残高（収入実額 − 今日までの引落） */
  todayBalance: number
  /** 採用された収入額（実績 or 設定既定値） */
  cycleIncome: number
  /** 収入が実績（income transactions）由来か */
  incomeIsActual: boolean
  /** 次の引落（最も早い1件） null=なし */
  nextWithdrawal: WithdrawalEntry | null
  /** 明日以降〜給料日前日 の確定済引落合計 */
  pendingTotal: number
  /** 同範囲のエントリ件数 */
  pendingCount: number
  /** 今日含む過去の引落合計（既に口座から出た） */
  alreadyPaidTotal: number
  /** 給料日前日の残高見通し */
  beforePaydayBalance: number
  /** 安全判定 */
  safety: 'safe' | 'warn' | 'danger'
  /** 給料日（次） */
  payDate: string
}

/**
 * Cashflow 画面の主要数値を一括計算。
 *
 * payCycleEnd = 現サイクル末日 = 給料日前日（実装上）
 * 範囲 [today, payCycleEnd] の引落を「給料日までの引落」として集計。
 */
export function buildCashflowSummary(
  transactions: Transaction[],
  cards: Card[],
  groups: BillingGroup[],
  monthlyIncome: number,
  payCycleStart: string,
  payCycleEnd: string,
  today: Date = new Date(),
): CashflowSummary {
  const todayISO = dateToISO(today)
  const payCycleEndDate = isoToDate(payCycleEnd)

  // v0.4.27: 収入を「実績優先」に。
  // 現サイクル内の income transaction があればその合計、なければ settings.monthlyIncome。
  const cycleIncomeFromTx = transactions
    .filter(
      (t) =>
        t.kind === 'income' &&
        t.date >= payCycleStart &&
        t.date <= payCycleEnd,
    )
    .reduce((s, t) => s + t.amount, 0)
  const incomeIsActual = cycleIncomeFromTx > 0
  const cycleIncome = incomeIsActual
    ? cycleIncomeFromTx
    : Math.max(0, Math.floor(monthlyIncome || 0))

  // 全引落（サイクル内）
  const cycleStartDate = isoToDate(payCycleStart)
  const allCycle = getAllWithdrawalsInRange(
    transactions,
    cards,
    groups,
    cycleStartDate,
    payCycleEndDate,
  )
  // 既に口座から出た（過去 + 今日）
  const alreadyPaid = allCycle.filter((w) => w.withdrawalDate <= todayISO)
  const alreadyPaidTotal = alreadyPaid.reduce((s, w) => s + w.total, 0)
  // 残り（明日以降）
  const pending = allCycle.filter((w) => w.withdrawalDate > todayISO)
  const pendingTotal = pending.reduce((s, w) => s + w.total, 0)
  const pendingCount = pending.length

  // v0.4.27: 今日の口座残高 = 採用収入 − 既に出た引落（社長指示「今日の引落も反映」）
  const todayBalance = cycleIncome - alreadyPaidTotal

  // 「次の引落」= 明日以降で最も近い1件（範囲外でも近未来があれば取りたいので拡張）
  let nextWithdrawal: WithdrawalEntry | null = pending[0] ?? null
  if (!nextWithdrawal) {
    const future = getAllWithdrawalsInRange(
      transactions,
      cards,
      groups,
      today,
      addDays(today, 60),
    ).filter((w) => w.withdrawalDate > todayISO)
    nextWithdrawal = future[0] ?? null
  }

  const beforePaydayBalance = todayBalance - pendingTotal

  let safety: 'safe' | 'warn' | 'danger' = 'safe'
  if (beforePaydayBalance < 0) safety = 'danger'
  else if (beforePaydayBalance < 60_000) safety = 'warn'

  const payDate = dateToISO(addDays(payCycleEndDate, 1))

  return {
    todayBalance,
    cycleIncome,
    incomeIsActual,
    nextWithdrawal,
    pendingTotal,
    pendingCount,
    alreadyPaidTotal,
    beforePaydayBalance,
    safety,
    payDate,
  }
}
