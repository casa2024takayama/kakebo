import type { BillingGroup, DaySpec } from '../types'
import holiday_jp from '@holiday-jp/holiday_jp'

/**
 * 締め日サイクル計算
 * - すべて JST のローカル日付として扱う（new Date(y,m,d) を使い UTC 解釈を回避）
 * - 月末日は 'last' で表現、短い月（2月など）は当月最終日に正規化
 * - 引落日が土日にあたる場合は翌営業日へ繰延（祝日マスタは仮で土日のみ）
 */

function lastDayOfMonth(year: number, month0: number): number {
  // month0 は 0-11
  return new Date(year, month0 + 1, 0).getDate()
}

function clampDay(year: number, month0: number, day: DaySpec): number {
  if (day === 'last') return lastDayOfMonth(year, month0)
  const last = lastDayOfMonth(year, month0)
  return Math.min(Math.max(1, day), last)
}

function toISO(year: number, month0: number, day: number): string {
  const m = String(month0 + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function parseISO(s: string): { y: number; m0: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m0: m - 1, d }
}

/** 土日 + 日本の祝日を除外する営業日判定 */
function isBusinessDay(year: number, month0: number, day: number): boolean {
  const date = new Date(year, month0, day)
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return false
  if (holiday_jp.isHoliday(date)) return false
  return true
}

/** 翌営業日に繰延 */
function shiftToNextBusinessDay(year: number, month0: number, day: number): {
  y: number
  m0: number
  d: number
} {
  let y = year
  let m0 = month0
  let d = day
  while (!isBusinessDay(y, m0, d)) {
    d += 1
    const last = lastDayOfMonth(y, m0)
    if (d > last) {
      d = 1
      m0 += 1
      if (m0 > 11) {
        m0 = 0
        y += 1
      }
    }
  }
  return { y, m0, d }
}

/**
 * ある取引日が属する請求サイクルと引落日を返す。
 * - 締め日 closingDay の当日まで（≤）が当月サイクル
 * - 締め日 +1 〜 翌締め日 が次サイクル
 * - 引落は「締め月の翌月」の withdrawalDay（土日は翌営業日）
 */
export function getCycleForTransaction(
  date: string,
  group: BillingGroup,
): { cycleStart: string; cycleEnd: string; withdrawalDate: string } {
  const { y, m0, d } = parseISO(date)
  const closingThisMonth = clampDay(y, m0, group.closingDay)

  let cycleEndY = y
  let cycleEndM0 = m0
  let cycleEndD = closingThisMonth
  if (d > closingThisMonth) {
    // 翌月の締め日に帰属
    cycleEndM0 = m0 + 1
    cycleEndY = y
    if (cycleEndM0 > 11) {
      cycleEndM0 = 0
      cycleEndY = y + 1
    }
    cycleEndD = clampDay(cycleEndY, cycleEndM0, group.closingDay)
  }

  // サイクル開始 = 前回締め日の翌日
  let prevM0 = cycleEndM0 - 1
  let prevY = cycleEndY
  if (prevM0 < 0) {
    prevM0 = 11
    prevY = cycleEndY - 1
  }
  const prevClosing = clampDay(prevY, prevM0, group.closingDay)
  // 翌日 = prevClosing + 1
  let startY = prevY
  let startM0 = prevM0
  let startD = prevClosing + 1
  if (startD > lastDayOfMonth(startY, startM0)) {
    startD = 1
    startM0 += 1
    if (startM0 > 11) {
      startM0 = 0
      startY += 1
    }
  }

  // 引落 = 締め月の翌月の withdrawalDay（土日は翌営業日へ）
  let wY = cycleEndY
  let wM0 = cycleEndM0 + 1
  if (wM0 > 11) {
    wM0 = 0
    wY = cycleEndY + 1
  }
  const wDay = clampDay(wY, wM0, group.withdrawalDay)
  const shifted = shiftToNextBusinessDay(wY, wM0, wDay)

  return {
    cycleStart: toISO(startY, startM0, startD),
    cycleEnd: toISO(cycleEndY, cycleEndM0, cycleEndD),
    withdrawalDate: toISO(shifted.y, shifted.m0, shifted.d),
  }
}

/** 今日以降で最も近い「次回引落日」と、その締め期間を返す */
export function getNextCycleForGroup(
  group: BillingGroup,
  today: Date = new Date(),
): { cycleStart: string; cycleEnd: string; withdrawalDate: string } {
  // 「今日が属するサイクル」の引落日が今日以降ならそれを返す。
  // 既に過ぎていれば、翌サイクル（締め日翌日）で再計算。
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate())
  const cur = getCycleForTransaction(todayISO, group)
  if (cur.withdrawalDate >= todayISO) return cur
  // 次サイクル：今日のサイクルの cycleEnd の翌日を起点に再計算
  const end = parseISO(cur.cycleEnd)
  let ny = end.y
  let nm0 = end.m0
  let nd = end.d + 1
  if (nd > lastDayOfMonth(ny, nm0)) {
    nd = 1
    nm0 += 1
    if (nm0 > 11) {
      nm0 = 0
      ny += 1
    }
  }
  return getCycleForTransaction(toISO(ny, nm0, nd), group)
}
