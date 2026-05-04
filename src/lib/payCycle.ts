import holiday_jp from '@holiday-jp/holiday_jp'
import type { DaySpec, PayDayShiftRule } from '../types'

/**
 * 給料日（pay day）基準の家計サイクル。
 * 「給料日 D」のとき、サイクル = D 〜 翌月 D-1 とする。
 * 例: payDay=15 のとき 4/15 〜 5/14 が「4月分サイクル」、payDate=4/15。
 *
 * 給料日が休業日（土日祝）の場合、shiftRule に従って実支給日を算出する：
 *   - 'before': 前営業日繰上（金融機関の通例）
 *   - 'after' : 翌営業日繰下
 *   - 'none'  : そのまま
 */
export type PayCycle = {
  /** サイクル開始（給料日, YYYY-MM-DD） */
  start: string
  /** サイクル終了（次給料日の前日, YYYY-MM-DD, inclusive） */
  end: string
  /** 実支給予定日（休業日シフト後） */
  payDate: string
}

function lastDayOfMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

function clampDay(y: number, m0: number, day: DaySpec): number {
  if (day === 'last') return lastDayOfMonth(y, m0)
  return Math.min(Math.max(1, day), lastDayOfMonth(y, m0))
}

function toISO(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function isBusinessDay(y: number, m0: number, d: number): boolean {
  const date = new Date(y, m0, d)
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return false
  if (holiday_jp.isHoliday(date)) return false
  return true
}

function shift(
  y: number,
  m0: number,
  d: number,
  rule: PayDayShiftRule,
): { y: number; m0: number; d: number } {
  if (rule === 'none') return { y, m0, d }
  const step = rule === 'before' ? -1 : 1
  let cy = y
  let cm0 = m0
  let cd = d
  while (!isBusinessDay(cy, cm0, cd)) {
    cd += step
    if (cd < 1) {
      cm0 -= 1
      if (cm0 < 0) {
        cm0 = 11
        cy -= 1
      }
      cd = lastDayOfMonth(cy, cm0)
    } else {
      const last = lastDayOfMonth(cy, cm0)
      if (cd > last) {
        cd = 1
        cm0 += 1
        if (cm0 > 11) {
          cm0 = 0
          cy += 1
        }
      }
    }
  }
  return { y: cy, m0: cm0, d: cd }
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return toISO(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

/** 与えた日付が含まれる「給料日サイクル」を返す */
export function getPayCycleForDate(
  date: Date,
  payDay: DaySpec = 15,
  shiftRule: PayDayShiftRule = 'before',
): PayCycle {
  const y = date.getFullYear()
  const m0 = date.getMonth()
  const d = date.getDate()
  const todayPayDay = clampDay(y, m0, payDay)

  // 当月の給料日以降ならサイクル開始 = 当月給料日
  // それより前なら前月給料日が開始
  let startY = y
  let startM0 = m0
  if (d < todayPayDay) {
    startM0 -= 1
    if (startM0 < 0) {
      startM0 = 11
      startY -= 1
    }
  }
  const startD = clampDay(startY, startM0, payDay)
  const start = toISO(startY, startM0, startD)

  // 次サイクル開始 = 翌月の給料日
  let nextY = startY
  let nextM0 = startM0 + 1
  if (nextM0 > 11) {
    nextM0 = 0
    nextY += 1
  }
  const nextD = clampDay(nextY, nextM0, payDay)
  const nextStart = toISO(nextY, nextM0, nextD)
  const end = addDays(nextStart, -1)

  // 実支給日（給料日のシフト後）
  const shifted = shift(startY, startM0, startD, shiftRule)
  const payDate = toISO(shifted.y, shifted.m0, shifted.d)

  return { start, end, payDate }
}

/** 現サイクルと次サイクル */
export function getCurrentAndNextCycles(
  payDay: DaySpec = 15,
  shiftRule: PayDayShiftRule = 'before',
  today: Date = new Date(),
): { current: PayCycle; next: PayCycle } {
  const current = getPayCycleForDate(today, payDay, shiftRule)
  // next: end の翌日
  const nextStartISO = addDays(current.end, 1)
  const [y, m, d] = nextStartISO.split('-').map(Number)
  const next = getPayCycleForDate(new Date(y, m - 1, d), payDay, shiftRule)
  return { current, next }
}

// ============================================================
// 長期表示対応：範囲内の全サイクルを返す（メモ化付き）
// ============================================================

/**
 * 指定範囲（startDate 〜 endDate, 両端含む）に重なる
 * すべての給料日サイクルを時系列で返す。
 *
 * - サイクル開始 ≤ endDate かつ サイクル終了 ≥ startDate を満たすものを抽出
 * - O(months) で計算（同一引数はメモ化）
 *
 * 例: 今日〜2027/5 を渡すと、その間のすべての給料日サイクルが返る
 */
const _cyclesCache = new Map<string, PayCycle[]>()

export function getCyclesInRange(
  startDate: Date,
  endDate: Date,
  payDay: DaySpec = 15,
  shiftRule: PayDayShiftRule = 'before',
): PayCycle[] {
  const startISO = toISO(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  )
  const endISO = toISO(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  )
  const cacheKey = `${startISO}|${endISO}|${payDay}|${shiftRule}`
  const cached = _cyclesCache.get(cacheKey)
  if (cached) return cached

  const out: PayCycle[] = []
  // 開始日を含むサイクルから走査開始
  let cursor = getPayCycleForDate(startDate, payDay, shiftRule)
  // 安全上限：120 サイクル ≒ 10年
  let safety = 120
  while (safety-- > 0) {
    // 範囲と重なるか
    if (cursor.end < startISO) {
      // 範囲より前 → 次へ
    } else if (cursor.start > endISO) {
      // 範囲より後 → 終了
      break
    } else {
      out.push(cursor)
    }
    // 次サイクル
    const nextStartISO = addDays(cursor.end, 1)
    const [y, m, d] = nextStartISO.split('-').map(Number)
    cursor = getPayCycleForDate(new Date(y, m - 1, d), payDay, shiftRule)
    if (cursor.start > endISO) break
  }

  _cyclesCache.set(cacheKey, out)
  return out
}

/** テスト/デバッグ用：内部キャッシュをクリア */
export function _clearPayCycleCache(): void {
  _cyclesCache.clear()
}
