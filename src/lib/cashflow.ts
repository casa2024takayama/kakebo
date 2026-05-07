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

import type {
  BillingGroup,
  Card,
  Transaction,
  DaySpec,
  PayDayShiftRule,
  BankSnapshot,
} from '../types'
import {
  getAllWithdrawalsInRange,
  computeDerivedDates,
  type WithdrawalEntry,
} from './withdrawalDate'
import { getPayCycleForDate } from './payCycle'

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
  /**
   * 今日の口座残高
   * - スナップショットあり: snapshot.amount + (snapshot日以降〜今日 の差分)
   * - スナップショットなし: cycleIncome − alreadyPaid（旧ロジック）
   */
  todayBalance: number
  /** 採用したスナップショット（あれば） */
  snapshot: BankSnapshot | null
  /** 採用された収入額（サイクル内 kind='income' の合計、Q1=D 厳格運用） */
  cycleIncome: number
  /** v0.4.32: 設定の月収（参考値として常に保持） */
  settingsMonthlyIncome: number
  /** 過去6サイクルの収入（直近順、新しいものから） */
  pastCycleIncomes: { start: string; end: string; payDate: string; total: number }[]
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
  payDay: DaySpec = 15,
  shiftRule: PayDayShiftRule = 'before',
  bankSnapshots: BankSnapshot[] = [],
): CashflowSummary {
  const todayISO = dateToISO(today)
  const payCycleEndDate = isoToDate(payCycleEnd)

  // v0.4.32 (Q1=D): サイクル内 kind='income' の合計のみを採用。
  // 設定値はフォールバックではなく「参考値」として別フィールドで保持。
  const cycleIncome = transactions
    .filter(
      (t) =>
        t.kind === 'income' &&
        t.date >= payCycleStart &&
        t.date <= payCycleEnd,
    )
    .reduce((s, t) => s + t.amount, 0)
  const settingsMonthlyIncome = Math.max(0, Math.floor(monthlyIncome || 0))

  // v0.4.32: 過去6サイクルの収入履歴
  const pastCycleIncomes: CashflowSummary['pastCycleIncomes'] = []
  for (let offset = 1; offset <= 6; offset++) {
    const refDate = new Date(today.getFullYear(), today.getMonth() - offset, 15)
    const cycle = getPayCycleForDate(refDate, payDay, shiftRule)
    const total = transactions
      .filter(
        (t) =>
          t.kind === 'income' &&
          t.date >= cycle.start &&
          t.date <= cycle.end,
      )
      .reduce((s, t) => s + t.amount, 0)
    if (total > 0) {
      pastCycleIncomes.push({
        start: cycle.start,
        end: cycle.end,
        payDate: cycle.payDate,
        total,
      })
    }
  }

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

  // v0.4.33: 銀行残高スナップショットがあればそれを真実値として採用
  // todayBalance = snapshot.amount + (snapshot.date < t.date <= today の差分)
  // 差分: kind='income' は加算、それ以外（excludeFromWithdrawalでない引落）は減算
  const latestSnapshot =
    bankSnapshots.length > 0
      ? [...bankSnapshots].sort((a, b) => b.date.localeCompare(a.date))[0]
      : null

  let todayBalance: number
  if (latestSnapshot) {
    let delta = 0
    for (const t of transactions) {
      if (t.excludeFromWithdrawal) continue
      // 引落日（派生）と利用日両方を考慮: incomeはt.date、その他はwithdrawalDate
      let effectiveDate: string
      if (t.kind === 'income') {
        effectiveDate = t.date
      } else {
        const derived = computeDerivedDates(t, groups, cards)
        effectiveDate = derived?.withdrawalDate ?? t.date
      }
      if (effectiveDate <= latestSnapshot.date) continue // スナップショットに既に反映
      if (effectiveDate > todayISO) continue // 未来は対象外
      if (t.kind === 'income') {
        delta += t.amount
      } else {
        delta -= t.amount
      }
    }
    todayBalance = latestSnapshot.amount + delta
  } else {
    // フォールバック: 旧ロジック（収入−既出引落）
    todayBalance = cycleIncome - alreadyPaidTotal
  }

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
    snapshot: latestSnapshot,
    cycleIncome,
    settingsMonthlyIncome,
    pastCycleIncomes,
    nextWithdrawal,
    pendingTotal,
    pendingCount,
    alreadyPaidTotal,
    beforePaydayBalance,
    safety,
    payDate,
  }
}
