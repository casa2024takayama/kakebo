import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { useStore } from '../store'
import { getPayCycleForDate } from '../lib/payCycle'
import { computeDerivedDates } from '../lib/withdrawalDate'
import type { Card, Transaction } from '../types'

function fmt(n: number): string {
  return n.toLocaleString('ja-JP')
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (parseISO(b).getTime() - parseISO(a).getTime()) / 86400000,
  )
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function monthDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

type Mode = 'aggregate' | 'detail'

type UsageDot = {
  date: string
  cardId: string
  cardName: string
  color: string
  total: number
  count: number
  txs: Transaction[]
}

type WithdrawDot = {
  date: string
  cardId: string
  cardName: string
  color: string
  total: number
  txs: Transaction[]
}

type CardBar = {
  cardId: string
  cardName: string
  color: string
  start: string
  end: string
  withdrawalDate: string
}

const CARD_FALLBACK_COLORS = [
  '#1A6B4A',
  '#2980B9',
  '#8E44AD',
  '#E5972A',
  '#E74C3C',
  '#16A085',
  '#D35400',
  '#7F8C8D',
]

function colorFor(card: Card, idx: number): string {
  return card.color || CARD_FALLBACK_COLORS[idx % CARD_FALLBACK_COLORS.length]
}

/** 期間内に入る日付かを判定 */
function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

/**
 * 表示期間内の請求期間バー（カードごと）：
 * 各カードについて、現サイクル〜次サイクルにかかる「請求期間」を抽出。
 * 取引由来ではなく、サイクル仕様から推定する：表示期間の中央付近の各日について
 * computeDerivedDates を呼ぶより、利用日基準で取引から拾う方が確実。
 * シンプルに「期間内に利用日のあった取引」のうちユニークな (cardId × cycleEnd)
 * を集計する。
 */
function buildCardBars(
  transactions: Transaction[],
  cards: Card[],
  groups: ReturnType<typeof useStore.getState>['billingGroups'],
  rangeStart: string,
  rangeEnd: string,
): CardBar[] {
  const seen = new Map<string, CardBar>()
  for (const t of transactions) {
    if (!t.cardId) continue
    if (!inRange(t.date, rangeStart, rangeEnd)) continue
    const card = cards.find((c) => c.id === t.cardId)
    if (!card) continue
    const idx = cards.findIndex((c) => c.id === card.id)
    const derived = computeDerivedDates(t, groups, cards)
    if (!derived) continue
    const key = `${card.id}|${derived.cycleEnd}`
    if (seen.has(key)) continue
    seen.set(key, {
      cardId: card.id,
      cardName: card.name,
      color: colorFor(card, idx),
      start: derived.cycleStart,
      end: derived.cycleEnd,
      withdrawalDate: derived.withdrawalDate,
    })
  }
  return Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start))
}

export default function Timeline() {
  const { transactions, cards, billingGroups, settings } = useStore()
  const [mode, setMode] = useState<Mode>('aggregate')
  const [cycleOffset, setCycleOffset] = useState(0)
  const [hoverDot, setHoverDot] = useState<{
    type: 'usage' | 'withdraw'
    key: string
  } | null>(null)
  const [isPortrait, setIsPortrait] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const check = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
      setIsNarrow(window.innerWidth < 768)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  const payDay =
    typeof settings.payDay === 'number' || settings.payDay === 'last'
      ? settings.payDay
      : 15
  const shiftRule = settings.payDayShiftRule ?? 'before'

  const cycles = useMemo(() => {
    // baseDate = today shifted by cycleOffset months (rough)
    const base = new Date()
    base.setMonth(base.getMonth() + cycleOffset)
    const current = getPayCycleForDate(base, payDay, shiftRule)
    const nextStart = addDays(current.end, 1)
    const next = getPayCycleForDate(parseISO(nextStart), payDay, shiftRule)
    return { current, next }
  }, [cycleOffset, payDay, shiftRule])

  const rangeStart = cycles.current.start
  const rangeEnd = cycles.next.end
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1

  const cardBars = useMemo(
    () => buildCardBars(transactions, cards, billingGroups, rangeStart, rangeEnd),
    [transactions, cards, billingGroups, rangeStart, rangeEnd],
  )

  // 利用日ドット（同日 × カードで集約）
  const usageDots = useMemo(() => {
    const map = new Map<string, UsageDot>()
    for (const t of transactions) {
      if (!t.cardId) continue
      if (t.kind === 'bulk') continue // 一括は利用日ドット出さない
      if (!inRange(t.date, rangeStart, rangeEnd)) continue
      const card = cards.find((c) => c.id === t.cardId)
      if (!card) continue
      const idx = cards.findIndex((c) => c.id === card.id)
      const key = `${t.date}|${card.id}`
      const existing = map.get(key)
      if (existing) {
        existing.total += t.amount
        existing.count += 1
        existing.txs.push(t)
      } else {
        map.set(key, {
          date: t.date,
          cardId: card.id,
          cardName: card.name,
          color: colorFor(card, idx),
          total: t.amount,
          count: 1,
          txs: [t],
        })
      }
    }
    return Array.from(map.values())
  }, [transactions, cards, rangeStart, rangeEnd])

  // 引落日ドット（カード×引落日で集約）
  const withdrawDots = useMemo(() => {
    const map = new Map<string, WithdrawDot>()
    for (const t of transactions) {
      if (!t.cardId) continue
      if (t.excludeFromWithdrawal) continue
      const card = cards.find((c) => c.id === t.cardId)
      if (!card) continue
      const derived = computeDerivedDates(t, billingGroups, cards)
      if (!derived) continue
      if (!inRange(derived.withdrawalDate, rangeStart, rangeEnd)) continue
      const idx = cards.findIndex((c) => c.id === card.id)
      const key = `${derived.withdrawalDate}|${card.id}`
      const existing = map.get(key)
      if (existing) {
        existing.total += t.amount
        existing.txs.push(t)
      } else {
        map.set(key, {
          date: derived.withdrawalDate,
          cardId: card.id,
          cardName: card.name,
          color: colorFor(card, idx),
          total: t.amount,
          txs: [t],
        })
      }
    }
    return Array.from(map.values())
  }, [transactions, cards, billingGroups, rangeStart, rangeEnd])

  // ドット最大金額（サイズ計算用）
  const maxUsage = usageDots.reduce((m, d) => Math.max(m, d.total), 0) || 1
  const maxWithdraw = withdrawDots.reduce((m, d) => Math.max(m, d.total), 0) || 1

  // 日付→x座標（パーセント）
  const toX = (iso: string): number => {
    const offset = daysBetween(rangeStart, iso)
    return (offset / (totalDays - 1)) * 100
  }

  const todayX = toX(todayISO())
  const showToday = todayISO() >= rangeStart && todayISO() <= rangeEnd

  const showPortraitWarning = isNarrow && isPortrait

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">タイムライン</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCycleOffset((v) => v - 1)}
            className="p-2 text-gray-500 hover:text-accent"
            aria-label="前のサイクル"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setCycleOffset(0)}
            className="p-2 text-gray-500 hover:text-accent"
            aria-label="今へ"
            title="今へ"
          >
            <RotateCw size={16} />
          </button>
          <button
            onClick={() => setCycleOffset((v) => v + 1)}
            className="p-2 text-gray-500 hover:text-accent"
            aria-label="次のサイクル"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          <p>
            現サイクル <span className="tabular-nums">{monthDay(cycles.current.start)}</span>
            〜<span className="tabular-nums">{monthDay(cycles.current.end)}</span>
            （給料日 {monthDay(cycles.current.payDate)}）
          </p>
          <p>
            次サイクル <span className="tabular-nums">{monthDay(cycles.next.start)}</span>
            〜<span className="tabular-nums">{monthDay(cycles.next.end)}</span>
            （給料日 {monthDay(cycles.next.payDate)}）
          </p>
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 text-xs">
          <button
            onClick={() => setMode('aggregate')}
            className={`px-2 py-1 rounded ${
              mode === 'aggregate' ? 'bg-white shadow-sm font-semibold' : 'text-gray-500'
            }`}
          >
            集約
          </button>
          <button
            onClick={() => setMode('detail')}
            className={`px-2 py-1 rounded ${
              mode === 'detail' ? 'bg-white shadow-sm font-semibold' : 'text-gray-500'
            }`}
          >
            明細
          </button>
        </div>
      </div>

      {showPortraitWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          タイムラインを見るには端末を横にするか、PCをご利用ください。
          下に簡易リストを表示しています。
        </div>
      )}

      {/* タイムライン本体 */}
      {!showPortraitWarning && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 overflow-x-auto">
          <div className="relative" style={{ minWidth: 720, height: 320 }}>
            {/* 縦線（給料日・サイクル境界・今日） */}
            {/* サイクル境界 */}
            <div
              className="absolute top-0 bottom-0 border-l border-dashed border-gray-300"
              style={{ left: `${toX(cycles.next.start)}%` }}
              title={`サイクル境界 ${monthDay(cycles.next.start)}`}
            />
            {/* 給料日（緑） */}
            <div
              className="absolute top-0 bottom-0 border-l-2 border-green-500/60"
              style={{ left: `${toX(cycles.current.payDate)}%` }}
              title={`給料日 ${monthDay(cycles.current.payDate)}`}
            />
            <div
              className="absolute top-0 bottom-0 border-l-2 border-green-500/60"
              style={{ left: `${toX(cycles.next.payDate)}%` }}
              title={`給料日 ${monthDay(cycles.next.payDate)}`}
            />
            {/* 今日（赤） */}
            {showToday && (
              <div
                className="absolute top-0 bottom-0 border-l-2 border-red-500"
                style={{ left: `${todayX}%` }}
                title={`今日 ${monthDay(todayISO())}`}
              />
            )}

            {/* 上半分：利用日ドット */}
            <div className="absolute left-0 right-0" style={{ top: 0, height: 130 }}>
              {usageDots.map((d) => {
                const sizePx = 8 + Math.sqrt(d.total / maxUsage) * 28
                const x = toX(d.date)
                const key = `u|${d.date}|${d.cardId}`
                const isHover =
                  hoverDot?.type === 'usage' && hoverDot.key === key
                return (
                  <div
                    key={key}
                    className="absolute -translate-x-1/2 cursor-pointer"
                    style={{
                      left: `${x}%`,
                      bottom: 8,
                    }}
                    onMouseEnter={() => setHoverDot({ type: 'usage', key })}
                    onMouseLeave={() => setHoverDot(null)}
                    onClick={() =>
                      setHoverDot(
                        isHover ? null : { type: 'usage', key },
                      )
                    }
                  >
                    <div
                      className="rounded-full flex items-center justify-center text-[10px] text-white font-semibold shadow"
                      style={{
                        width: sizePx,
                        height: sizePx,
                        backgroundColor: d.color,
                      }}
                      title={`${monthDay(d.date)} ${d.cardName} ¥${fmt(d.total)} (${d.count}件)`}
                    >
                      {d.count > 1 && (
                        <span className="text-[9px] leading-none">{d.count}</span>
                      )}
                    </div>
                    {(isHover || mode === 'detail') && (
                      <div
                        className="absolute z-20 bg-white dark:bg-gray-700 shadow-lg rounded-md px-2 py-1.5 text-[11px] whitespace-nowrap"
                        style={{
                          bottom: sizePx + 6,
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                      >
                        <div className="font-semibold">
                          {monthDay(d.date)} · {d.cardName}
                        </div>
                        <div className="tabular-nums">
                          ¥{fmt(d.total)} ({d.count}件)
                        </div>
                        {isHover && (
                          <ul className="mt-1 space-y-0.5 max-w-[180px]">
                            {d.txs.map((t) => (
                              <li key={t.id} className="text-gray-600 dark:text-gray-300 truncate">
                                ¥{fmt(t.amount)} {t.memo || '-'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 中央軸 */}
            <div
              className="absolute left-0 right-0 border-t border-gray-300"
              style={{ top: 145 }}
            />

            {/* 中央：請求期間バー */}
            <div className="absolute left-0 right-0" style={{ top: 150, height: 50 }}>
              {cardBars.map((b, i) => {
                const x1 = Math.max(0, toX(b.start))
                const x2 = Math.min(100, toX(b.end))
                const width = Math.max(2, x2 - x1)
                const top = (i % 4) * 11
                return (
                  <div
                    key={`bar|${b.cardId}|${b.start}`}
                    className="absolute rounded-sm flex items-center justify-center text-[9px] text-white font-medium overflow-hidden"
                    style={{
                      left: `${x1}%`,
                      width: `${width}%`,
                      top,
                      height: 8,
                      backgroundColor: b.color,
                      opacity: 0.85,
                    }}
                    title={`${b.cardName} 請求期間 ${monthDay(b.start)}〜${monthDay(b.end)} → 引落 ${monthDay(b.withdrawalDate)}`}
                  />
                )
              })}
            </div>

            {/* 下半分：引落日ドット */}
            <div className="absolute left-0 right-0" style={{ top: 210, height: 100 }}>
              {withdrawDots.map((d) => {
                const sizePx = 10 + Math.sqrt(d.total / maxWithdraw) * 30
                const x = toX(d.date)
                const key = `w|${d.date}|${d.cardId}`
                const isHover =
                  hoverDot?.type === 'withdraw' && hoverDot.key === key
                return (
                  <div
                    key={key}
                    className="absolute -translate-x-1/2 cursor-pointer"
                    style={{
                      left: `${x}%`,
                      top: 8,
                    }}
                    onMouseEnter={() => setHoverDot({ type: 'withdraw', key })}
                    onMouseLeave={() => setHoverDot(null)}
                    onClick={() =>
                      setHoverDot(
                        isHover ? null : { type: 'withdraw', key },
                      )
                    }
                  >
                    <div
                      className="rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow ring-2 ring-white"
                      style={{
                        width: sizePx,
                        height: sizePx,
                        backgroundColor: d.color,
                      }}
                      title={`引落 ${monthDay(d.date)} ${d.cardName} ¥${fmt(d.total)}`}
                    />
                    <div className="text-[10px] mt-1 text-center tabular-nums">
                      ¥{fmt(d.total)}
                    </div>
                    {(isHover || mode === 'detail') && (
                      <div
                        className="absolute z-20 bg-white dark:bg-gray-700 shadow-lg rounded-md px-2 py-1.5 text-[11px] whitespace-nowrap"
                        style={{
                          top: sizePx + 24,
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                      >
                        <div className="font-semibold">
                          引落 {monthDay(d.date)} · {d.cardName}
                        </div>
                        <div className="tabular-nums">¥{fmt(d.total)}</div>
                        {isHover && (
                          <ul className="mt-1 space-y-0.5 max-w-[200px]">
                            {d.txs.slice(0, 6).map((t) => (
                              <li key={t.id} className="text-gray-600 dark:text-gray-300 truncate">
                                {monthDay(t.date)} ¥{fmt(t.amount)} {t.memo || '-'}
                              </li>
                            ))}
                            {d.txs.length > 6 && (
                              <li className="text-gray-400">他 {d.txs.length - 6}件</li>
                            )}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 日付ラベル（給料日のみ） */}
            <div className="absolute left-0 right-0 bottom-0 text-[10px] text-gray-500">
              <div
                className="absolute -translate-x-1/2"
                style={{ left: `${toX(cycles.current.payDate)}%` }}
              >
                {monthDay(cycles.current.payDate)}
              </div>
              <div
                className="absolute -translate-x-1/2"
                style={{ left: `${toX(cycles.next.payDate)}%` }}
              >
                {monthDay(cycles.next.payDate)}
              </div>
              <div
                className="absolute -translate-x-1/2"
                style={{ left: `100%` }}
              >
                {monthDay(rangeEnd)}
              </div>
              {showToday && (
                <div
                  className="absolute -translate-x-1/2 text-red-500 font-semibold"
                  style={{ left: `${todayX}%` }}
                >
                  今日
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 簡易リスト（縦表示時に常に出す。横でも下に補助として） */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          引落予定（時系列）
        </h2>
        {withdrawDots.length === 0 ? (
          <p className="text-xs text-gray-400">この期間の引落予定はありません</p>
        ) : (
          <div className="space-y-1.5">
            {withdrawDots
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((d) => (
                <div
                  key={`list|${d.date}|${d.cardId}`}
                  className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-xs text-gray-500 tabular-nums w-12">
                    {monthDay(d.date)}
                  </span>
                  <span className="flex-1 truncate">{d.cardName}</span>
                  <span className="font-semibold tabular-nums">¥{fmt(d.total)}</span>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
