import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import {
  useStore,
  resolveTimelineVisibleIds,
  TIMELINE_VISIBLE_CARDS_MAX,
} from '../store'
import { getCyclesInRange } from '../lib/payCycle'
import {
  getAllWithdrawalsInRange,
  type WithdrawalEntry,
} from '../lib/withdrawalDate'
import { getTodayPosition, getClippedPeriod } from '../lib/timelineRange'
import { resolveCardColor, cardAbbrev, adjustLightness } from '../lib/cardColors'
import { generateTimelineDemo } from '../lib/timelineSeedData'
import type { Card, Transaction } from '../types'

// ============================================================
// Helpers
// ============================================================
function fmt(n: number): string {
  return n.toLocaleString('ja-JP')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function todayISO(): string {
  return dateToISO(new Date())
}

function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return dateToISO(d)
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
}

function monthDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

const WD_JP = ['日', '月', '火', '水', '木', '金', '土']
function weekdayJP(iso: string): string {
  return WD_JP[parseISO(iso).getDay()]
}

// ============================================================
// Layout constants (per spec §2)
// ============================================================
const PX_PER_DAY = 5
const TOP_H = 170
const AXIS_H = 60
const BOTTOM_H = 210
const LEFT_PAD = 32
const RIGHT_PAD = 32
const TOP_PAD = 24
const BOT_PAD = 24
const LANE_PITCH = 16 // bar 10 + gap 6
const BAR_H = 10

// ============================================================
// Card color resolver memoised by card list
// ============================================================
function buildColorMap(cards: Card[]): Map<string, string> {
  const m = new Map<string, string>()
  cards.forEach((c, i) => m.set(c.id, resolveCardColor(c.name, c.color, i)))
  return m
}

// ============================================================
// Types
// ============================================================
type UsageDot = {
  date: string
  cardId: string
  cardName: string
  color: string
  total: number
  count: number
  txs: Transaction[]
  isFuture: boolean
}

type CardBar = {
  cardId: string
  cardName: string
  color: string
  start: string
  end: string
  withdrawalDate: string
  total: number
  txCount: number
}

type Popover =
  | { type: 'usage'; key: string; x: number; y: number; dot: UsageDot }
  | { type: 'withdraw'; key: string; x: number; y: number; entry: WithdrawalEntry; cardName: string; color: string }
  | { type: 'bar'; key: string; x: number; y: number; bar: CardBar }
  | null

// ============================================================
// Timeline Page Component
// ============================================================
export default function Timeline() {
  const transactions = useStore((s) => s.transactions)
  const cards = useStore((s) => s.cards)
  const billingGroups = useStore((s) => s.billingGroups)
  const settings = useStore((s) => s.settings)
  const timelineFilter = useStore((s) => s.timelineFilter)
  const toggleTimelineCardVisibility = useStore((s) => s.toggleTimelineCardVisibility)
  const setTimelineVisibleCardIds = useStore((s) => s.setTimelineVisibleCardIds)
  const addTransactions = useStore((s) => s.addTransactions)
  const setCards = useStore((s) => s.setCards)
  const setBillingGroups = useStore((s) => s.setBillingGroups)

  const [cycleOffset, setCycleOffset] = useState(0)
  const [popover, setPopover] = useState<Popover>(null)
  const [showHint, setShowHint] = useState(true)
  const [overflowMsg, setOverflowMsg] = useState<string | null>(null)
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  })
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Responsive
  useEffect(() => {
    const onR = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onR)
    window.addEventListener('orientationchange', onR)
    return () => {
      window.removeEventListener('resize', onR)
      window.removeEventListener('orientationchange', onR)
    }
  }, [])
  const isPortrait = viewport.h > viewport.w
  const isMobile = viewport.w < 768
  const isTablet = viewport.w >= 768 && viewport.w < 1024
  const isCompressed = viewport.w >= 1024 && viewport.w < 1280
  const portraitWarning = isMobile && isPortrait

  // Hide drag hint after 4s
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4000)
    return () => clearTimeout(t)
  }, [])

  const colorMap = useMemo(() => buildColorMap(cards), [cards])
  const colorOf = useCallback(
    (cardId: string): string => colorMap.get(cardId) ?? '#4B5563',
    [colorMap],
  )

  // Visible cards (filter)
  const visibleCardIds = useMemo(
    () => resolveTimelineVisibleIds(timelineFilter, cards),
    [timelineFilter, cards],
  )
  const visibleSet = useMemo(() => new Set(visibleCardIds), [visibleCardIds])

  // Pay day settings
  const payDay =
    typeof settings.payDay === 'number' || settings.payDay === 'last'
      ? settings.payDay
      : 15
  const shiftRule = settings.payDayShiftRule ?? 'before'

  // Range: span 2 cycles (current + offset, plus 1 next), plus offset shift
  const cyclesPlus = useMemo(() => {
    const today = new Date()
    today.setMonth(today.getMonth() + cycleOffset)
    // Show range: 1 month before today's cycle start to 2 months after
    const rangeStart = new Date(today)
    rangeStart.setMonth(rangeStart.getMonth() - 1)
    const rangeEnd = new Date(today)
    rangeEnd.setMonth(rangeEnd.getMonth() + 2)
    return getCyclesInRange(rangeStart, rangeEnd, payDay, shiftRule)
  }, [cycleOffset, payDay, shiftRule])

  const rangeStart = cyclesPlus.length > 0 ? cyclesPlus[0].start : todayISO()
  const rangeEnd =
    cyclesPlus.length > 0
      ? cyclesPlus[cyclesPlus.length - 1].end
      : addDaysISO(todayISO(), 60)
  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd) + 1)

  // Plot width (px) — drives horizontal scroll
  const plotWidth = Math.max(1136, totalDays * PX_PER_DAY)
  const dayToX = useCallback(
    (iso: string): number => {
      const off = daysBetween(rangeStart, iso)
      return (off / Math.max(1, totalDays - 1)) * plotWidth
    },
    [rangeStart, totalDays, plotWidth],
  )

  // Today position
  const todayPos = useMemo(
    () => getTodayPosition(rangeStart, rangeEnd, todayISO()),
    [rangeStart, rangeEnd],
  )
  const todayPx = todayPos.ratio * plotWidth

  // Withdrawal entries within range
  const withdrawals = useMemo(
    () =>
      getAllWithdrawalsInRange(
        transactions,
        cards,
        billingGroups,
        parseISO(rangeStart),
        parseISO(rangeEnd),
      ).filter((w) => visibleSet.has(w.cardId)),
    [transactions, cards, billingGroups, rangeStart, rangeEnd, visibleSet],
  )

  // Card bars (billing periods) — derived from withdrawals
  const cardBars = useMemo<CardBar[]>(() => {
    const out: CardBar[] = []
    for (const w of withdrawals) {
      const card = cards.find((c) => c.id === w.cardId)
      if (!card) continue
      out.push({
        cardId: w.cardId,
        cardName: card.name,
        color: colorOf(w.cardId),
        start: w.cycleStart,
        end: w.cycleEnd,
        withdrawalDate: w.withdrawalDate,
        total: w.total,
        txCount: w.transactions.length,
      })
    }
    return out.sort((a, b) => a.start.localeCompare(b.start))
  }, [withdrawals, cards, colorOf])

  // Lane assignment for bars: per cardId
  const cardLaneIndex = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>()
    visibleCardIds.forEach((id, i) => m.set(id, i))
    return m
  }, [visibleCardIds])

  // Usage dots
  const usageDots = useMemo<UsageDot[]>(() => {
    const map = new Map<string, UsageDot>()
    const today = todayISO()
    for (const t of transactions) {
      if (!t.cardId || !visibleSet.has(t.cardId)) continue
      if (t.kind === 'bulk') continue
      if (t.date < rangeStart || t.date > rangeEnd) continue
      const card = cards.find((c) => c.id === t.cardId)
      if (!card) continue
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
          color: colorOf(card.id),
          total: t.amount,
          count: 1,
          txs: [t],
          isFuture: t.date > today,
        })
      }
    }
    return Array.from(map.values())
  }, [transactions, cards, rangeStart, rangeEnd, visibleSet, colorOf])

  const maxUsage = Math.max(1, usageDots.reduce((m, d) => Math.max(m, d.total), 0))
  const maxWithdraw = Math.max(
    1,
    withdrawals.reduce((m, w) => Math.max(m, w.total), 0),
  )

  // Scale dimensions for compressed/tablet
  const layout = useMemo(() => {
    if (isMobile || isTablet) {
      return { topH: 130, axisH: 50, botH: 180, lanePitch: 14, barH: 8, dotMaxU: 16, dotMaxW: 28 }
    }
    if (isCompressed) {
      return { topH: 140, axisH: 50, botH: 190, lanePitch: 14, barH: 9, dotMaxU: 18, dotMaxW: 32 }
    }
    return { topH: TOP_H, axisH: AXIS_H, botH: BOTTOM_H, lanePitch: LANE_PITCH, barH: BAR_H, dotMaxU: 20, dotMaxW: 36 }
  }, [isMobile, isTablet, isCompressed])

  const totalH = layout.topH + layout.axisH + layout.botH

  // Generate month/week ticks
  const ticks = useMemo(() => {
    const monthTicks: { iso: string; label: string }[] = []
    const weekTicks: string[] = []
    const startD = parseISO(rangeStart)
    const endD = parseISO(rangeEnd)
    let cur = new Date(startD.getFullYear(), startD.getMonth(), 1)
    while (cur <= endD) {
      const iso = dateToISO(cur)
      if (iso >= rangeStart) {
        monthTicks.push({ iso, label: isCompressed || isMobile ? `${cur.getMonth() + 1}` : `${cur.getMonth() + 1}月` })
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
    const c = new Date(startD)
    while (c <= endD) {
      if (c.getDay() === 1) weekTicks.push(dateToISO(c))
      c.setDate(c.getDate() + 1)
    }
    return { monthTicks, weekTicks }
  }, [rangeStart, rangeEnd, isCompressed, isMobile])

  // ============================================================
  // Filter actions
  // ============================================================
  const handleToggle = useCallback(
    (cardId: string) => {
      const ok = toggleTimelineCardVisibility(cardId)
      if (!ok) {
        setOverflowMsg(`最大${TIMELINE_VISIBLE_CARDS_MAX}枚まで表示できます`)
        setTimeout(() => setOverflowMsg(null), 2500)
      }
    },
    [toggleTimelineCardVisibility],
  )

  const presetPriority2 = useCallback(() => {
    // Pick first 2 by hardcoded priority: セゾン > AEON > others
    const order = (n: string) => {
      const lower = n.toLowerCase()
      if (lower.includes('セゾン') || lower.includes('saison')) return 0
      if (lower.includes('イオン') || lower.includes('aeon')) return 1
      if (lower.includes('jcb')) return 2
      if (lower.includes('paypay') || lower.includes('ペイペイ')) return 3
      return 9
    }
    const sorted = [...cards].sort((a, b) => order(a.name) - order(b.name))
    setTimelineVisibleCardIds(sorted.slice(0, 2).map((c) => c.id))
  }, [cards, setTimelineVisibleCardIds])

  const presetAll = useCallback(() => {
    const ids = cards.slice(0, TIMELINE_VISIBLE_CARDS_MAX).map((c) => c.id)
    setTimelineVisibleCardIds(ids)
  }, [cards, setTimelineVisibleCardIds])

  const presetClear = useCallback(() => {
    setTimelineVisibleCardIds([])
  }, [setTimelineVisibleCardIds])

  // ============================================================
  // Drag scroll
  // ============================================================
  const dragState = useRef<{ startX: number; startScroll: number; active: boolean }>({
    startX: 0,
    startScroll: 0,
    active: false,
  })
  const onMouseDownScroll = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    if (!scrollRef.current) return
    dragState.current = {
      startX: e.clientX,
      startScroll: scrollRef.current.scrollLeft,
      active: true,
    }
  }
  const onMouseMoveScroll = (e: React.MouseEvent) => {
    if (!dragState.current.active || !scrollRef.current) return
    const dx = e.clientX - dragState.current.startX
    scrollRef.current.scrollLeft = dragState.current.startScroll - dx
  }
  const stopDrag = () => {
    dragState.current.active = false
  }

  // Auto-scroll to today on mount/range change
  useEffect(() => {
    if (!scrollRef.current) return
    if (!todayPos.inRange) return
    const containerW = scrollRef.current.clientWidth
    const target = todayPx - containerW / 2
    scrollRef.current.scrollLeft = Math.max(0, target)
  }, [todayPx, todayPos.inRange, rangeStart])

  // ============================================================
  // Demo seed (DEV only)
  // ============================================================
  const handleSeed = () => {
    if (!import.meta.env.DEV) return
    if (!confirm('デモデータを投入します。既存のカード/グループ/取引はそのまま、デモ分が追加されます。続行しますか？')) return
    const demo = generateTimelineDemo()
    setBillingGroups([...useStore.getState().billingGroups, ...demo.groups])
    setCards([...useStore.getState().cards, ...demo.cards])
    addTransactions(demo.transactions)
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="px-4 pt-6 pb-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">タイムライン</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCycleOffset((v) => v - 1)}
            className="p-2 text-gray-500 hover:text-accent rounded"
            aria-label="前のサイクル"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setCycleOffset(0)}
            className="p-2 text-gray-500 hover:text-accent rounded"
            aria-label="今へ"
            title="今へ"
          >
            <RotateCw size={16} />
          </button>
          <button
            onClick={() => setCycleOffset((v) => v + 1)}
            className="p-2 text-gray-500 hover:text-accent rounded"
            aria-label="次のサイクル"
          >
            <ChevronRight size={18} />
          </button>
          {import.meta.env.DEV && (
            <button
              onClick={handleSeed}
              className="ml-2 px-2 py-1 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded border border-amber-200"
              title="DEV専用: タイムライン用デモデータを追加"
            >
              DEV: シード投入
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-3 space-y-2"
        data-no-drag
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">表示カード</span>
            <button
              onClick={presetPriority2}
              className="px-2 py-0.5 text-[11px] font-semibold text-white bg-accent rounded-full"
            >
              優先2枚
            </button>
            <button
              onClick={presetAll}
              className="px-2 py-0.5 text-[11px] font-semibold text-white bg-accent rounded-full"
            >
              全表示
            </button>
            <button
              onClick={presetClear}
              className="px-2 py-0.5 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-full border border-gray-200"
            >
              クリア
            </button>
          </div>
          <span className="text-[11px] text-gray-500 tabular-nums">
            {visibleCardIds.length}/{Math.min(cards.length, TIMELINE_VISIBLE_CARDS_MAX)}件
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cards.length === 0 && (
            <span className="text-xs text-gray-400">カードが登録されていません</span>
          )}
          {cards.map((c) => {
            const checked = visibleSet.has(c.id)
            const color = colorOf(c.id)
            return (
              <button
                key={c.id}
                onClick={() => handleToggle(c.id)}
                aria-pressed={checked}
                aria-label={`${c.name} カード表示 ${checked ? 'オン' : 'オフ'}`}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full transition"
                style={{
                  border: `1.5px solid ${color}`,
                  backgroundColor: checked ? `${color}1A` : 'white',
                  color: checked ? color : '#6B7280',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span>{c.name}</span>
                {checked && <span aria-hidden>✓</span>}
              </button>
            )
          })}
        </div>
        {overflowMsg && (
          <div className="text-[11px] text-amber-700">{overflowMsg}</div>
        )}
      </div>

      {portraitWarning ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          📱 タイムラインは横向きまたはPCで表示できます。下に簡易リストを表示しています。
        </div>
      ) : (
        <div
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm relative"
          aria-label={`タイムライン ${rangeStart}〜${rangeEnd} 引落予定${withdrawals.length}件 利用ドット${usageDots.length}件`}
          role="img"
        >
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing"
            style={{ paddingLeft: LEFT_PAD, paddingRight: RIGHT_PAD, paddingTop: TOP_PAD, paddingBottom: BOT_PAD }}
            onMouseDown={onMouseDownScroll}
            onMouseMove={onMouseMoveScroll}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
          >
            <div
              className="relative"
              style={{ width: plotWidth, height: totalH }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setPopover(null)
              }}
            >
              {/* SVG: axis grid + ticks + connector lines */}
              <svg
                width={plotWidth}
                height={totalH}
                className="absolute inset-0 pointer-events-none"
              >
                {/* Center axis line */}
                <line
                  x1={0}
                  y1={layout.topH + layout.axisH / 2}
                  x2={plotWidth}
                  y2={layout.topH + layout.axisH / 2}
                  stroke="#1C1C1E"
                  strokeOpacity={0.2}
                  strokeWidth={1}
                />
                {/* Month main ticks */}
                {ticks.monthTicks.map((m) => (
                  <g key={`mt-${m.iso}`}>
                    <line
                      x1={dayToX(m.iso)}
                      y1={layout.topH + layout.axisH / 2}
                      x2={dayToX(m.iso)}
                      y2={layout.topH + layout.axisH / 2 + 8}
                      stroke="#1C1C1E"
                      strokeOpacity={0.33}
                      strokeWidth={1}
                    />
                    <text
                      x={dayToX(m.iso) + 3}
                      y={layout.topH + layout.axisH / 2 + 22}
                      fontSize={12}
                      fontWeight={600}
                      fill="#1C1C1E"
                    >
                      {m.label}
                    </text>
                  </g>
                ))}
                {/* Week ticks */}
                {ticks.weekTicks.map((w) => (
                  <line
                    key={`wt-${w}`}
                    x1={dayToX(w)}
                    y1={layout.topH + layout.axisH / 2}
                    x2={dayToX(w)}
                    y2={layout.topH + layout.axisH / 2 + 4}
                    stroke="#1C1C1E"
                    strokeOpacity={0.13}
                    strokeWidth={1}
                  />
                ))}
                {/* Connection lines: bar end → withdrawal dot */}
                {cardBars.map((b) => {
                  const lane = cardLaneIndex.get(b.cardId) ?? 0
                  const barTop =
                    layout.topH + layout.axisH + 12 + lane * layout.lanePitch
                  const barMidY = barTop + layout.barH / 2
                  const wClip = getClippedPeriod(
                    { start: b.start, end: b.end },
                    { start: rangeStart, end: rangeEnd },
                  )
                  if (wClip.outOfRange) return null
                  const x2 = dayToX(wClip.visibleEnd)
                  const wdInRange =
                    b.withdrawalDate >= rangeStart && b.withdrawalDate <= rangeEnd
                  if (!wdInRange) return null
                  const wdX = dayToX(b.withdrawalDate)
                  const dotY = barTop + layout.barH + 28
                  return (
                    <g key={`cn-${b.cardId}-${b.start}`}>
                      <path
                        d={`M ${x2} ${barMidY} L ${wdX - 6} ${barMidY} L ${wdX} ${dotY}`}
                        stroke={b.color}
                        strokeOpacity={0.35}
                        strokeWidth={1}
                        fill="none"
                      />
                      <polygon
                        points={`${wdX - 4},${dotY - 6} ${wdX + 4},${dotY - 6} ${wdX},${dotY - 1}`}
                        fill={b.color}
                        fillOpacity={0.5}
                      />
                    </g>
                  )
                })}
              </svg>

              {/* Pay day & cycle boundary lines */}
              {cyclesPlus.map((c, i) => (
                <div key={`cyc-${i}`} className="absolute inset-y-0 pointer-events-none">
                  {/* Pay day green */}
                  <div
                    className="absolute top-0 bottom-0"
                    style={{
                      left: dayToX(c.payDate),
                      width: 0,
                      borderLeft: '2px solid #1A6B4A',
                      opacity: 0.7,
                    }}
                  />
                  <div
                    className="absolute text-[10px] font-medium text-white px-1.5 py-0.5 rounded"
                    style={{
                      left: dayToX(c.payDate) + 4,
                      top: 4,
                      backgroundColor: '#1A6B4A',
                    }}
                  >
                    給 {monthDay(c.payDate)}
                  </div>
                  {/* Cycle boundary dashed (start of next cycle) */}
                  {i > 0 && (
                    <div
                      className="absolute top-0 bottom-0"
                      style={{
                        left: dayToX(c.start),
                        width: 0,
                        borderLeft: '1px dashed #9CA3AF',
                      }}
                    />
                  )}
                </div>
              ))}

              {/* Today marker */}
              {todayPos.inRange && (
                <>
                  <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left: todayPx,
                      width: 0,
                      borderLeft: '2px solid #C0392B',
                      boxShadow: '0 0 8px rgba(192,57,43,0.4)',
                    }}
                  />
                  <div
                    className="absolute text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md pointer-events-none"
                    style={{
                      left: todayPx + 4,
                      top: 22,
                      backgroundColor: '#C0392B',
                    }}
                  >
                    今日 {monthDay(todayISO())}
                  </div>
                </>
              )}

              {/* Top half: usage dots */}
              <div
                className="absolute left-0 right-0"
                style={{ top: 0, height: layout.topH }}
              >
                {(() => {
                  // Group same-day usage dots from same card stack vertically
                  const byDate = new Map<string, UsageDot[]>()
                  usageDots.forEach((d) => {
                    const arr = byDate.get(d.date) ?? []
                    arr.push(d)
                    byDate.set(d.date, arr)
                  })
                  const elements: JSX.Element[] = []
                  byDate.forEach((arr, date) => {
                    arr.sort((a, b) => b.total - a.total)
                    const visibleCount = Math.min(arr.length, 4)
                    arr.slice(0, visibleCount).forEach((d, idx) => {
                      const sizePx =
                        4 + Math.sqrt(d.total / maxUsage) * (layout.dotMaxU - 4)
                      const x = dayToX(date)
                      const yOff = idx * 6
                      const key = `u|${date}|${d.cardId}`
                      elements.push(
                        <button
                          key={key}
                          data-no-drag
                          className="absolute -translate-x-1/2 focus:outline-none focus:ring-2 focus:ring-accent rounded-full"
                          style={{
                            left: x,
                            bottom: 8 + yOff,
                            width: sizePx,
                            height: sizePx,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            const parent = scrollRef.current!.getBoundingClientRect()
                            setPopover({
                              type: 'usage',
                              key,
                              x: rect.left - parent.left + scrollRef.current!.scrollLeft + sizePx / 2,
                              y: rect.top - parent.top + scrollRef.current!.scrollTop,
                              dot: d,
                            })
                          }}
                          aria-label={`${monthDay(date)} ${d.cardName} ${fmt(d.total)}円 ${d.count}件`}
                          title={`${monthDay(date)} ${d.cardName} ¥${fmt(d.total)} (${d.count}件)`}
                        >
                          <div
                            className="rounded-full flex items-center justify-center text-white"
                            style={{
                              width: '100%',
                              height: '100%',
                              backgroundColor: d.color,
                              border: d.isFuture
                                ? `1.5px dashed ${d.color}`
                                : '2px solid white',
                              opacity: d.isFuture ? 0.6 : 1,
                              fontSize: 9,
                              fontWeight: 700,
                            }}
                          >
                            {sizePx >= 12 && d.count > 1 ? d.count : ''}
                          </div>
                        </button>,
                      )
                    })
                    if (arr.length > 4) {
                      const x = dayToX(date)
                      elements.push(
                        <div
                          key={`u-more-${date}`}
                          className="absolute -translate-x-1/2 text-[9px] font-bold text-white bg-gray-500 rounded-full px-1.5 py-0.5"
                          style={{
                            left: x + 8,
                            bottom: 8 + 4 * 6,
                          }}
                        >
                          +{arr.length - 4}
                        </div>,
                      )
                    }
                  })
                  return elements
                })()}
              </div>

              {/* Bottom half: billing bars + withdraw dots */}
              <div
                className="absolute left-0 right-0"
                style={{
                  top: layout.topH + layout.axisH,
                  height: layout.botH,
                }}
              >
                {/* Bars */}
                {cardBars.map((b) => {
                  const lane = cardLaneIndex.get(b.cardId) ?? 0
                  const top = 12 + lane * layout.lanePitch
                  const clip = getClippedPeriod(
                    { start: b.start, end: b.end },
                    { start: rangeStart, end: rangeEnd },
                  )
                  if (clip.outOfRange) return null
                  const xL = dayToX(clip.visibleStart)
                  const xR = dayToX(clip.visibleEnd)
                  const w = Math.max(2, xR - xL)
                  const today = todayISO()
                  let timeState: 'past' | 'now' | 'future' = 'future'
                  if (b.end < today) timeState = 'past'
                  else if (b.start <= today && today <= b.end) timeState = 'now'
                  const borderColor = adjustLightness(b.color, -10)
                  return (
                    <button
                      key={`bar-${b.cardId}-${b.start}`}
                      data-no-drag
                      className="absolute focus:outline-none focus:ring-2 focus:ring-accent"
                      style={{
                        left: xL,
                        top,
                        width: w,
                        height: layout.barH,
                        borderRadius: 5,
                        background: `linear-gradient(to right, ${b.color}8C, ${b.color}F0)`,
                        border:
                          timeState === 'future'
                            ? `1px dashed ${borderColor}`
                            : `${timeState === 'now' ? 1.5 : 1}px solid ${borderColor}`,
                        opacity: timeState === 'past' ? 0.7 : 1,
                        boxShadow:
                          timeState === 'now'
                            ? `0 0 6px ${b.color}88`
                            : 'none',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const parent = scrollRef.current!.getBoundingClientRect()
                        setPopover({
                          type: 'bar',
                          key: `bar-${b.cardId}-${b.start}`,
                          x: rect.left - parent.left + scrollRef.current!.scrollLeft + w / 2,
                          y: rect.top - parent.top + scrollRef.current!.scrollTop,
                          bar: b,
                        })
                      }}
                      aria-label={`${b.cardName} 請求期間 ${monthDay(b.start)}から${monthDay(b.end)} 引落 ${monthDay(b.withdrawalDate)} ${fmt(b.total)}円`}
                      title={`${b.cardName} 請求期間 ${monthDay(b.start)}〜${monthDay(b.end)} → 引落 ${monthDay(b.withdrawalDate)} ¥${fmt(b.total)} (${b.txCount}件)`}
                    >
                      {w >= 80 && (
                        <span
                          className="absolute inset-0 flex items-center justify-center text-white font-semibold pointer-events-none"
                          style={{ fontSize: 10 }}
                        >
                          {b.cardName} {monthDay(b.start)}–{monthDay(b.end)}
                        </span>
                      )}
                      {clip.startClipped && (
                        <span
                          className="absolute -left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none"
                          style={{ color: b.color }}
                        >
                          ‹
                        </span>
                      )}
                      {clip.endClipped && (
                        <span
                          className="absolute -right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none"
                          style={{ color: b.color }}
                        >
                          ›
                        </span>
                      )}
                    </button>
                  )
                })}

                {/* Withdrawal dots */}
                {withdrawals.map((w) => {
                  const card = cards.find((c) => c.id === w.cardId)
                  if (!card) return null
                  const color = colorOf(w.cardId)
                  const lane = cardLaneIndex.get(w.cardId) ?? 0
                  const top = 12 + lane * layout.lanePitch + layout.barH + 28
                  const sizePx =
                    12 + Math.sqrt(w.total / maxWithdraw) * (layout.dotMaxW - 12)
                  const x = dayToX(w.withdrawalDate)
                  const key = `w|${w.withdrawalDate}|${w.cardId}`
                  // Withdrawal day shift indicator
                  const wd = weekdayJP(w.withdrawalDate)
                  return (
                    <div
                      key={key}
                      className="absolute"
                      style={{ left: x, top, transform: 'translateX(-50%)' }}
                    >
                      <button
                        data-no-drag
                        className="rounded-full flex items-center justify-center text-white font-bold focus:outline-none focus:ring-2 focus:ring-accent"
                        style={{
                          width: sizePx,
                          height: sizePx,
                          backgroundColor: color,
                          border: '2px solid white',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                          fontSize: 9,
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          const parent = scrollRef.current!.getBoundingClientRect()
                          setPopover({
                            type: 'withdraw',
                            key,
                            x: rect.left - parent.left + scrollRef.current!.scrollLeft + sizePx / 2,
                            y: rect.top - parent.top + scrollRef.current!.scrollTop,
                            entry: w,
                            cardName: card.name,
                            color,
                          })
                        }}
                        aria-label={`引落 ${monthDay(w.withdrawalDate)} ${card.name} ${fmt(w.total)}円`}
                        title={`引落 ${monthDay(w.withdrawalDate)}(${wd}) ${card.name} ¥${fmt(w.total)}`}
                      >
                        {cardAbbrev(card.name)}
                      </button>
                      <div
                        className="text-center mt-1 whitespace-nowrap"
                        style={{ fontSize: 11 }}
                      >
                        <div className="font-semibold tabular-nums" style={{ color }}>
                          {monthDay(w.withdrawalDate)}({wd})
                        </div>
                        <div className="text-text font-bold tabular-nums" style={{ fontSize: 13 }}>
                          ¥{fmt(w.total)}
                        </div>
                        <div className="text-gray-500 truncate" style={{ fontSize: 10, maxWidth: 80 }}>
                          {card.name}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Popover */}
              {popover && (
                <div
                  className="absolute z-30 pointer-events-auto"
                  style={{
                    left: Math.min(plotWidth - 240, Math.max(0, popover.x - 110)),
                    top: Math.max(0, popover.y - 120),
                    width: 220,
                  }}
                  data-no-drag
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="rounded-xl p-3 shadow-lg text-[11px] space-y-1"
                    style={{
                      background: 'rgba(255,255,255,0.94)',
                      backdropFilter: isMobile ? undefined : 'blur(12px)',
                      WebkitBackdropFilter: isMobile ? undefined : 'blur(12px)',
                      border: '1px solid rgba(0,0,0,0.08)',
                    }}
                  >
                    {popover.type === 'usage' && (
                      <>
                        <div className="font-semibold text-[12px]">
                          {monthDay(popover.dot.date)}({weekdayJP(popover.dot.date)}) · {popover.dot.cardName}
                        </div>
                        <div className="font-bold text-[15px] tabular-nums">
                          ¥{fmt(popover.dot.total)} <span className="text-[10px] text-gray-500 font-normal">{popover.dot.count}件</span>
                        </div>
                        <div className="border-t border-gray-200 pt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                          {popover.dot.txs.slice(0, 8).map((t) => (
                            <div key={t.id} className="flex justify-between text-gray-700">
                              <span className="truncate">{t.memo || '-'}</span>
                              <span className="tabular-nums ml-2">¥{fmt(t.amount)}</span>
                            </div>
                          ))}
                          {popover.dot.txs.length > 8 && (
                            <div className="text-gray-400">他 {popover.dot.txs.length - 8}件</div>
                          )}
                        </div>
                      </>
                    )}
                    {popover.type === 'withdraw' && (
                      <>
                        <div className="font-semibold text-[12px]">
                          引落 {monthDay(popover.entry.withdrawalDate)}({weekdayJP(popover.entry.withdrawalDate)}) · {popover.cardName}
                        </div>
                        <div className="font-bold text-[15px] tabular-nums">
                          ¥{fmt(popover.entry.total)}
                        </div>
                        <div className="text-gray-500">
                          請求期間 {monthDay(popover.entry.cycleStart)}–{monthDay(popover.entry.cycleEnd)}
                        </div>
                        <div className="border-t border-gray-200 pt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                          {popover.entry.transactions.slice(0, 8).map((t) => (
                            <div key={t.id} className="flex justify-between text-gray-700">
                              <span className="truncate">{monthDay(t.date)} {t.memo || '-'}</span>
                              <span className="tabular-nums ml-2">¥{fmt(t.amount)}</span>
                            </div>
                          ))}
                          {popover.entry.transactions.length > 8 && (
                            <div className="text-gray-400">他 {popover.entry.transactions.length - 8}件</div>
                          )}
                        </div>
                      </>
                    )}
                    {popover.type === 'bar' && (
                      <>
                        <div className="font-semibold text-[12px]">
                          {popover.bar.cardName}
                        </div>
                        <div>請求期間 {monthDay(popover.bar.start)}–{monthDay(popover.bar.end)}</div>
                        <div>引落予定 {monthDay(popover.bar.withdrawalDate)}({weekdayJP(popover.bar.withdrawalDate)})</div>
                        <div className="font-bold tabular-nums text-[14px]">¥{fmt(popover.bar.total)} <span className="text-[10px] text-gray-500 font-normal">{popover.bar.txCount}件</span></div>
                      </>
                    )}
                    <button
                      onClick={() => setPopover(null)}
                      className="absolute top-1 right-2 text-gray-400 hover:text-gray-600 text-xs"
                      aria-label="閉じる"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Drag hint */}
          {showHint && !isMobile && (
            <div className="absolute bottom-2 right-3 text-[10px] text-gray-400 pointer-events-none">
              ⇄ ドラッグでスクロール
            </div>
          )}

          {/* Today floating jump (when off-screen) */}
          {todayPos.inRange && (
            <button
              onClick={() => {
                if (!scrollRef.current) return
                scrollRef.current.scrollLeft = Math.max(
                  0,
                  todayPx - scrollRef.current.clientWidth / 2,
                )
              }}
              className="absolute top-2 right-3 text-[10px] font-semibold text-white bg-danger rounded-full px-2 py-0.5 shadow"
              data-no-drag
            >
              今日へ ↗
            </button>
          )}
        </div>
      )}

      {/* Backup list (always shown beneath) */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          引落予定（時系列）
        </h2>
        {withdrawals.length === 0 ? (
          <p className="text-xs text-gray-400">この期間の引落予定はありません</p>
        ) : (
          <div className="space-y-1.5">
            {withdrawals
              .slice()
              .sort((a, b) => a.withdrawalDate.localeCompare(b.withdrawalDate))
              .map((w) => {
                const card = cards.find((c) => c.id === w.cardId)
                const name = card?.name ?? '?'
                const color = colorOf(w.cardId)
                return (
                  <div
                    key={`list|${w.withdrawalDate}|${w.cardId}`}
                    className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-gray-500 tabular-nums w-16">
                      {monthDay(w.withdrawalDate)}({weekdayJP(w.withdrawalDate)})
                    </span>
                    <span className="flex-1 truncate">{name}</span>
                    <span className="font-semibold tabular-nums">¥{fmt(w.total)}</span>
                  </div>
                )
              })}
          </div>
        )}
      </section>
    </div>
  )
}
