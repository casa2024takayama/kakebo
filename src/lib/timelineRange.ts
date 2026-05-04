/**
 * タイムライン表示範囲ユーティリティ
 *
 * デザインに依存しないロジック層：
 * - 「今日」マーカーの位置計算
 * - 期間バーの左右クリッピング情報
 *
 * 日付は YYYY-MM-DD (JST) を前提とする。
 */

export type DateRangeISO = {
  /** YYYY-MM-DD */
  start: string
  /** YYYY-MM-DD (inclusive) */
  end: string
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function daysBetween(aISO: string, bISO: string): number {
  return Math.round(
    (parseISO(bISO).getTime() - parseISO(aISO).getTime()) / 86400000,
  )
}

/**
 * 表示範囲の中で「今日」がどの位置（0〜1）にあるかを返す。
 * 範囲外なら inRange=false で、ratio は端にクランプ（0 or 1）される。
 */
export function getTodayPosition(
  rangeStart: Date | string,
  rangeEnd: Date | string,
  today: Date | string = new Date(),
): { ratio: number; inRange: boolean } {
  const startISO =
    typeof rangeStart === 'string' ? rangeStart : dateToISO(rangeStart)
  const endISO = typeof rangeEnd === 'string' ? rangeEnd : dateToISO(rangeEnd)
  const todayISO = typeof today === 'string' ? today : dateToISO(today)

  const totalDays = daysBetween(startISO, endISO)
  if (totalDays <= 0) {
    return { ratio: 0, inRange: todayISO === startISO }
  }
  const inRange = todayISO >= startISO && todayISO <= endISO
  if (todayISO < startISO) return { ratio: 0, inRange: false }
  if (todayISO > endISO) return { ratio: 1, inRange: false }
  const offset = daysBetween(startISO, todayISO)
  return { ratio: offset / totalDays, inRange }
}

/**
 * 表示範囲を超える「期間バー」のクリッピング情報を返す。
 * - startClipped: 期間の開始が範囲より前で切れている
 * - endClipped:   期間の終了が範囲より後で切れている
 * - visibleStart / visibleEnd: 範囲内に収めた可視区間
 *
 * 戻り値の visibleStart > visibleEnd になるケース（=範囲外）は呼び出し側で
 * フィルタすること。
 */
export function getClippedPeriod(
  period: DateRangeISO,
  range: DateRangeISO,
): {
  startClipped: boolean
  endClipped: boolean
  visibleStart: string
  visibleEnd: string
  /** 完全に範囲外（重なりなし） */
  outOfRange: boolean
} {
  const startClipped = period.start < range.start
  const endClipped = period.end > range.end
  const visibleStart = startClipped ? range.start : period.start
  const visibleEnd = endClipped ? range.end : period.end
  const outOfRange = period.end < range.start || period.start > range.end
  return { startClipped, endClipped, visibleStart, visibleEnd, outOfRange }
}
