/**
 * v0.4.23 Cashflow画面（3ペインレイアウト）— Stage A+B
 *
 * design-reference/design_handoff_kakebo_cashflow に基づく実装。
 * - Stage A: 左ペイン4ブロック
 * - Stage B: 中央ペイン カレンダー（給料日タグ・引落ドット・推移残高）
 * - Stage C: 右ペイン プレースホルダ（次回実装）
 */

import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { useStore } from '../store'
import { getCurrentAndNextCycles, getPayCycleForDate } from '../lib/payCycle'
import { buildCashflowSummary } from '../lib/cashflow'
import { getAllWithdrawalsInRange } from '../lib/withdrawalDate'
import { storage } from '../lib/storage'

function fmt(n: number): string {
  return n.toLocaleString('ja-JP')
}

function dayOfWeekLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
}

function formatMD(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

export default function Cashflow() {
  const {
    transactions,
    cards,
    billingGroups,
    categories,
    settings,
  } = useStore()

  const today = new Date()
  const payDay =
    typeof settings.payDay === 'number' || settings.payDay === 'last'
      ? settings.payDay
      : 15
  const shiftRule = settings.payDayShiftRule ?? 'before'
  const monthlyIncome = settings.monthlyIncome ?? 0

  const payCycles = useMemo(
    () => getCurrentAndNextCycles(payDay, shiftRule, today),
    [payDay, shiftRule, today],
  )

  // v0.4.33: 銀行残高スナップショット取得
  const bankSnapshots = useMemo(() => storage.getBankSnapshots(), [transactions])

  const summary = useMemo(
    () =>
      buildCashflowSummary(
        transactions,
        cards,
        billingGroups,
        monthlyIncome,
        payCycles.current.start,
        payCycles.current.end,
        today,
        payDay,
        shiftRule,
        bankSnapshots,
      ),
    [transactions, cards, billingGroups, monthlyIncome, payCycles.current.start, payCycles.current.end, today, payDay, shiftRule, bankSnapshots],
  )

  // ===== Stage B: カレンダー =====
  const [monthOffset, setMonthOffset] = useState(0)
  const calendarMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
    return { year: d.getFullYear(), month0: d.getMonth() }
  }, [today, monthOffset])

  // 月のセル42個（6行×7列、日曜始まり）
  const calendarCells = useMemo(() => {
    const { year, month0 } = calendarMonth
    const firstDay = new Date(year, month0, 1)
    const startDow = firstDay.getDay() // 0=日
    const cells: { date: Date; inMonth: boolean; iso: string }[] = []
    const start = new Date(year, month0, 1 - startDow)
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      cells.push({
        date: d,
        inMonth: d.getMonth() === month0,
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      })
    }
    return cells
  }, [calendarMonth])

  // 月内のイベント（引落 + 給料日）
  const monthEvents = useMemo(() => {
    const { year, month0 } = calendarMonth
    const monthStart = new Date(year, month0, 1)
    const monthEnd = new Date(year, month0 + 1, 0)
    const withdrawals = getAllWithdrawalsInRange(
      transactions,
      cards,
      billingGroups,
      monthStart,
      monthEnd,
    )
    // 給料日: その月の給料日サイクルの「次の給料日」を取得
    const payCycle = getPayCycleForDate(monthStart, payDay, shiftRule)
    const payDateInMonth: string[] = []
    if (payCycle.payDate.startsWith(`${year}-${String(month0 + 1).padStart(2, '0')}`)) {
      payDateInMonth.push(payCycle.payDate)
    }
    // 月内に給料日が複数（前後サイクル）あり得るケース: 翌月分も範囲なら追加
    const nextPay = getPayCycleForDate(
      new Date(year, month0 + 1, 1),
      payDay,
      shiftRule,
    )
    if (
      nextPay.payDate.startsWith(`${year}-${String(month0 + 1).padStart(2, '0')}`) &&
      !payDateInMonth.includes(nextPay.payDate)
    ) {
      payDateInMonth.push(nextPay.payDate)
    }
    // セル日付別にイベントをまとめる
    const byDate = new Map<
      string,
      { withdrawals: typeof withdrawals; isPayDay: boolean }
    >()
    for (const w of withdrawals) {
      const e = byDate.get(w.withdrawalDate) ?? { withdrawals: [], isPayDay: false }
      e.withdrawals.push(w)
      byDate.set(w.withdrawalDate, e)
    }
    for (const pd of payDateInMonth) {
      const e = byDate.get(pd) ?? { withdrawals: [], isPayDay: false }
      e.isPayDay = true
      byDate.set(pd, e)
    }
    return byDate
  }, [calendarMonth, transactions, cards, billingGroups, payDay, shiftRule])

  // v0.4.27: 推移残高（今日終了時点の残高をベースに、明日以降のイベントを順次反映）
  const todayISOStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const runningBalance = useMemo(() => {
    const map = new Map<string, number>()
    let bal = summary.todayBalance
    map.set(todayISOStr, bal) // 今日のセル = 既に今日の引落反映済み
    for (const cell of calendarCells) {
      if (cell.iso <= todayISOStr) continue // 今日まではスキップ
      const e = monthEvents.get(cell.iso)
      if (e) {
        for (const w of e.withdrawals) bal -= w.total
        // 給料日には現サイクル収入額を加算（仮に同額として予測）
        if (e.isPayDay) bal += summary.cycleIncome
      }
      map.set(cell.iso, bal)
    }
    return map
  }, [calendarCells, monthEvents, todayISOStr, summary.todayBalance, summary.cycleIncome])

  const cardColorOfId = (cardId: string): string => {
    if (!cardId) return '#7a6d5e'
    return cards.find((c) => c.id === cardId)?.color ?? '#7a6d5e'
  }

  // ===== Stage C: 右ペイン 確定済請求リスト =====
  const [billSort, setBillSort] = useState<'date' | 'amount'>('date')

  // ===== Stage D: カレンダーセル選択 → 右ペイン詳細表示 =====
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // Esc で選択解除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDate) {
        setSelectedDate(null)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedDate])

  const selectedDayEvent = selectedDate ? monthEvents.get(selectedDate) : undefined

  // 今日以降の引落予定すべて（最大90日先まで）
  const pendingBills = useMemo(() => {
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + 90)
    const list = getAllWithdrawalsInRange(
      transactions,
      cards,
      billingGroups,
      today,
      horizon,
    ).filter((w) => w.withdrawalDate >= todayISOStr)
    if (billSort === 'amount') {
      return [...list].sort((a, b) => b.total - a.total)
    }
    return list
  }, [transactions, cards, billingGroups, today, todayISOStr, billSort])

  function daysUntil(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number)
    const target = new Date(y, m - 1, d)
    const ms = target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    return Math.max(0, Math.round(ms / 86400000))
  }

  function progressOfCycle(iso: { cycleStart: string; cycleEnd: string; withdrawalDate: string }): number {
    const start = new Date(iso.cycleStart).getTime()
    const end = new Date(iso.withdrawalDate).getTime()
    const now = today.getTime()
    if (end <= start) return 100
    const ratio = ((now - start) / (end - start)) * 100
    return Math.max(0, Math.min(100, Math.round(ratio)))
  }

  const cardNameOf = (cardId: string): string => {
    if (!cardId) return '非カード取引'
    return cards.find((c) => c.id === cardId)?.name ?? '—'
  }
  const cardColorOf = (cardId: string): string => {
    if (!cardId) return '#7a6d5e'
    return cards.find((c) => c.id === cardId)?.color ?? '#7a6d5e'
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">家計</h1>
        <p className="text-xs text-gray-500">
          {today.getFullYear()}年{today.getMonth() + 1}月{today.getDate()}日
        </p>
      </div>

      {/* 3ペイングリッド: PC=左300px/中央自由/右340px、タブレット以下は縦積み */}
      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)_340px] grid-cols-1">
        {/* 左ペイン：4ブロック */}
        <aside className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 space-y-5 border border-gray-100 dark:border-gray-700">
          {/* Block 1: 今日の口座残高 */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-500">
              今日の口座残高
            </p>
            {summary.cycleIncome > 0 ? (
              <>
                <p className="text-3xl md:text-[36px] font-bold tabular-nums tracking-tight mt-1">
                  ¥{fmt(summary.todayBalance)}
                </p>
                <p className="text-[11px] text-gray-400 mt-1 tabular-nums">
                  {todayISOStr.slice(5).replace('-', '/')}({dayOfWeekLabel(todayISOStr)}) 時点
                </p>
                <div className="mt-2 space-y-0.5">
                  {summary.snapshot ? (
                    <>
                      <div className="flex items-center justify-between text-[11px] tabular-nums">
                        <span className="text-blue-700">📊 銀行残高スナップショット</span>
                        <span className="text-blue-700 font-semibold">
                          ¥{fmt(summary.snapshot.amount)}
                        </span>
                      </div>
                      <p className="text-[9px] text-gray-400 tabular-nums">
                        {summary.snapshot.date}（{summary.snapshot.note ?? summary.snapshot.source}）以降の差分を反映
                      </p>
                    </>
                  ) : (
                    <p className="text-[10px] text-gray-400">
                      みずほCSV取込で銀行残高を同期できます
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[11px] tabular-nums pt-1">
                    <span className="text-accent/80">✓ 今サイクルの実収入</span>
                    <span className="text-accent font-semibold">
                      ¥{fmt(summary.cycleIncome)}
                    </span>
                  </div>
                  {summary.settingsMonthlyIncome > 0 && (
                    <div className="flex items-center justify-between text-[10px] tabular-nums text-gray-400">
                      <span>設定値（参考）</span>
                      <span>¥{fmt(summary.settingsMonthlyIncome)}</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-3xl md:text-[36px] font-bold tabular-nums tracking-tight mt-1 text-gray-400">
                  ¥0
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  今サイクルに収入記録がありません。
                  <br />
                  <Link to="/add" className="text-accent underline">
                    入力で「収入」を記録
                  </Link>
                  するか、CSVから取り込んでください。
                </p>
                {summary.settingsMonthlyIncome > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1 tabular-nums">
                    設定値（参考）¥{fmt(summary.settingsMonthlyIncome)}
                  </p>
                )}
              </>
            )}

            {/* v0.4.32: 過去サイクルの収入履歴 */}
            {summary.pastCycleIncomes.length > 0 && (
              <details className="mt-3 group">
                <summary className="text-[10px] text-gray-500 cursor-pointer select-none hover:text-gray-700">
                  過去サイクルの収入 ({summary.pastCycleIncomes.length})
                </summary>
                <ul className="mt-1.5 space-y-0.5 text-[10px] tabular-nums">
                  {summary.pastCycleIncomes.map((c) => (
                    <li
                      key={c.start}
                      className="flex items-center justify-between text-gray-500"
                    >
                      <span>
                        {c.start.slice(5).replace('-', '/')}〜
                        {c.end.slice(5).replace('-', '/')}
                      </span>
                      <span>¥{fmt(c.total)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* Block 2: 次の引落 */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-500">
              次の引落
            </p>
            {summary.nextWithdrawal ? (
              <>
                <p
                  className="text-2xl font-bold tabular-nums tracking-tight mt-1"
                  style={{ color: cardColorOf(summary.nextWithdrawal.cardId) }}
                >
                  ¥{fmt(summary.nextWithdrawal.total)}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {formatMD(summary.nextWithdrawal.withdrawalDate)}({dayOfWeekLabel(summary.nextWithdrawal.withdrawalDate)}) ・{' '}
                  {cardNameOf(summary.nextWithdrawal.cardId)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-1">予定なし</p>
            )}
          </div>

          {/* Block 3: 確定済 · 引落待ち合計 */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-500">
              確定済 · 引落待ち
            </p>
            <p className="text-[22px] font-bold tabular-nums tracking-tight mt-1 text-danger">
              ¥{fmt(summary.pendingTotal)}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {summary.pendingCount}件 ・ 給料日({formatMD(summary.payDate)})までに着弾
            </p>
          </div>

          {/* Block 4: 給料日前日の残高見通し（=月末予測） */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-500">
              給料日前日の残高見通し
            </p>
            {summary.cycleIncome > 0 ? (
              <>
                <p
                  className={`text-lg font-bold tabular-nums tracking-tight mt-1 ${
                    summary.safety === 'danger'
                      ? 'text-danger'
                      : summary.safety === 'warn'
                      ? 'text-warning'
                      : 'text-accent'
                  }`}
                >
                  ¥{fmt(summary.beforePaydayBalance)}
                </p>
                <div className="mt-2 space-y-1 text-[11px] tabular-nums">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>今日の残高</span>
                    <span>¥{fmt(summary.todayBalance)}</span>
                  </div>
                  <div className="flex justify-between text-danger">
                    <span>− 残り引落（明日以降）</span>
                    <span>−¥{fmt(summary.pendingTotal)}</span>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>= 給料日前日</span>
                    <span
                      className={
                        summary.safety === 'danger'
                          ? 'text-danger'
                          : summary.safety === 'warn'
                          ? 'text-warning'
                          : 'text-accent'
                      }
                    >
                      ¥{fmt(summary.beforePaydayBalance)}
                    </span>
                  </div>
                </div>
                <p
                  className={`text-[10px] mt-2 inline-block px-2 py-0.5 rounded-full ${
                    summary.safety === 'danger'
                      ? 'bg-danger/10 text-danger'
                      : summary.safety === 'warn'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-accent/10 text-accent'
                  }`}
                >
                  {summary.safety === 'danger'
                    ? '警戒域 — 給料日前にマイナス'
                    : summary.safety === 'warn'
                    ? '注意 — 残高が少ない'
                    : '安全圏'}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-1">収入未記録</p>
            )}
          </div>
        </aside>

        {/* 中央ペイン：カレンダー */}
        <section className="bg-[#f7f4ed] dark:bg-gray-900 rounded-2xl p-4 lg:p-5">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold tabular-nums">
              {calendarMonth.year}年 {calendarMonth.month0 + 1}月
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMonthOffset((v) => v - 1)}
                className="p-1.5 rounded hover:bg-white/60 text-gray-600"
                aria-label="前の月"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setMonthOffset(0)}
                className="px-2 py-1 text-xs rounded hover:bg-white/60 text-gray-600"
              >
                今月
              </button>
              <button
                onClick={() => setMonthOffset((v) => v + 1)}
                className="p-1.5 rounded hover:bg-white/60 text-gray-600"
                aria-label="次の月"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-px text-[10px] font-bold tracking-[0.1em] uppercase mb-1">
            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
              <div
                key={d}
                className={`text-center py-1 ${
                  i === 0
                    ? 'text-[#9d3a4a]'
                    : i === 6
                    ? 'text-[#3a6989]'
                    : 'text-gray-500'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* カレンダー本体 */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
            {calendarCells.map((cell) => {
              const isToday = cell.iso === todayISOStr
              const event = monthEvents.get(cell.iso)
              const balance = runningBalance.get(cell.iso)
              const dow = cell.date.getDay()
              const hasEvent = !!event && (event.isPayDay || event.withdrawals.length > 0)
              const isSelected = selectedDate === cell.iso
              return (
                <div
                  key={cell.iso}
                  onClick={hasEvent ? () => setSelectedDate(isSelected ? null : cell.iso) : undefined}
                  className={`bg-white dark:bg-gray-800 p-1.5 min-h-[68px] lg:min-h-[76px] relative text-[11px] transition-all ${
                    cell.inMonth ? '' : 'opacity-40'
                  } ${
                    hasEvent ? 'cursor-pointer hover:bg-amber-50 dark:hover:bg-gray-700' : ''
                  } ${
                    isSelected ? 'ring-2 ring-[#b87333] ring-inset bg-amber-50 dark:bg-gray-700' : ''
                  }`}
                  role={hasEvent ? 'button' : undefined}
                  aria-pressed={hasEvent ? isSelected : undefined}
                  aria-label={hasEvent ? `${cell.date.getMonth() + 1}月${cell.date.getDate()}日 詳細を表示` : undefined}
                >
                  {/* 日付 */}
                  <div className="flex items-start justify-between">
                    <span
                      className={`tabular-nums ${
                        isToday
                          ? 'bg-[#b87333] text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold'
                          : dow === 0
                          ? 'text-[#9d3a4a]'
                          : dow === 6
                          ? 'text-[#3a6989]'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {isToday && (
                      <span className="text-[8px] font-bold tracking-wider text-[#b87333]">
                        TODAY
                      </span>
                    )}
                  </div>

                  {/* イベント */}
                  <div className="mt-0.5 space-y-0.5">
                    {event?.isPayDay && (() => {
                      // v0.4.33: 給料日タグの金額は「その日に発生した実 income transactions の合計」
                      // 実データなければサイクル収入額、それも0なら設定値
                      const actualOnDay = transactions
                        .filter((t) => t.kind === 'income' && t.date === cell.iso)
                        .reduce((s, t) => s + t.amount, 0)
                      const dispYen = actualOnDay > 0 ? actualOnDay : summary.cycleIncome > 0 ? summary.cycleIncome : monthlyIncome
                      return (
                        <div className="bg-[#e6efe8] text-[#3d6e4a] text-[9px] font-semibold px-1 py-0.5 rounded tabular-nums">
                          +¥{(dispYen / 10000).toFixed(0)}万
                        </div>
                      )
                    })()}
                    {event?.withdrawals.slice(0, 2).map((w, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 text-[9px] tabular-nums"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cardColorOfId(w.cardId) }}
                        />
                        <span className="text-[#9d3a4a] font-semibold truncate">
                          −¥{w.total >= 10000 ? `${(w.total / 10000).toFixed(1)}万` : fmt(w.total)}
                        </span>
                      </div>
                    ))}
                    {event && event.withdrawals.length > 2 && (
                      <p className="text-[8px] text-gray-400">
                        +{event.withdrawals.length - 2}
                      </p>
                    )}
                  </div>

                  {/* 推移残高（イベントがあるセルのみ） */}
                  {balance !== undefined && (event?.isPayDay || (event && event.withdrawals.length > 0)) && (
                    <p className="absolute bottom-1 right-1.5 text-[8px] text-[#c9beac] tabular-nums">
                      {balance >= 10000
                        ? `${(balance / 10000).toFixed(0)}万`
                        : balance < 0
                        ? `−${fmt(Math.abs(balance))}`
                        : fmt(balance)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-gray-400 mt-2">
            ドット = 引落（カードカラー） / 緑タグ = 給料日 / 右下 = 推移残高
          </p>
        </section>

        {/* 右ペイン：確定済請求リスト or 日別詳細 */}
        <aside className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 border border-gray-100 dark:border-gray-700 space-y-3">
          {selectedDate ? (
            // 日別詳細ビュー
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setSelectedDate(null)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-accent"
                >
                  <ArrowLeft size={14} /> 一覧に戻る
                </button>
                <span className="text-[10px] text-gray-400">Esc で閉じる</span>
              </div>
              <div className="border-b border-gray-100 dark:border-gray-700 pb-3">
                <p className="text-[10px] tracking-[0.12em] uppercase text-gray-500 font-bold">
                  {dayOfWeekLabel(selectedDate)}曜日
                </p>
                <p className="text-3xl font-bold tabular-nums tracking-tight mt-1">
                  {parseInt(selectedDate.split('-')[1], 10)}/
                  {parseInt(selectedDate.split('-')[2], 10)}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                  {selectedDate}
                </p>
              </div>

              {/* 給料日タグ */}
              {selectedDayEvent?.isPayDay && (
                <div className="bg-[#e6efe8] text-[#3d6e4a] rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold">給料日</span>
                  <span className="text-base font-bold tabular-nums">
                    +¥{fmt(monthlyIncome)}
                  </span>
                </div>
              )}

              {/* 引落リスト（カード別、関連取引は表示しない） */}
              {selectedDayEvent && selectedDayEvent.withdrawals.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-500">
                    引落
                  </p>
                  <ul className="space-y-2">
                    {selectedDayEvent.withdrawals.map((w, i) => {
                      const cardName = w.cardId
                        ? cards.find((c) => c.id === w.cardId)?.name ?? '—'
                        : (() => {
                            const t = w.transactions[0]
                            const cat = t
                              ? categories.find((c) => c.id === t.categoryId)?.name ?? ''
                              : ''
                            return t?.memo || cat || '非カード'
                          })()
                      return (
                        <li
                          key={i}
                          className="border border-gray-200 dark:border-gray-700 rounded-md p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cardColorOfId(w.cardId) }}
                            />
                            <span className="text-xs font-medium truncate flex-1">
                              {cardName}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {w.transactions.length}件
                            </span>
                          </div>
                          <p
                            className="text-xl font-bold tabular-nums tracking-tight mt-1.5"
                            style={{ color: cardColorOfId(w.cardId) }}
                          >
                            −¥{fmt(w.total)}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                            請求期間 {formatMD(w.cycleStart)}〜{formatMD(w.cycleEnd)}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-2 flex items-center justify-between text-xs">
                    <span className="text-gray-500">合計</span>
                    <span className="font-bold tabular-nums text-danger">
                      −¥{fmt(selectedDayEvent.withdrawals.reduce((s, w) => s + w.total, 0))}
                    </span>
                  </div>
                </div>
              ) : selectedDayEvent?.isPayDay ? null : (
                <p className="text-xs text-gray-400 text-center py-6">
                  この日のイベントはありません
                </p>
              )}

              {/* v0.4.27: 推移残高（その日終了時点の見通し） */}
              {selectedDate && runningBalance.has(selectedDate) && (
                <div className="bg-[#f7f4ed] dark:bg-gray-700 rounded-lg px-3 py-2.5 mt-2">
                  <p className="text-[10px] tracking-[0.12em] uppercase text-gray-500 font-bold">
                    その日終了時点の残高見通し
                  </p>
                  <p
                    className={`text-xl font-bold tabular-nums tracking-tight mt-1 ${
                      (runningBalance.get(selectedDate) ?? 0) < 0
                        ? 'text-danger'
                        : (runningBalance.get(selectedDate) ?? 0) < 60_000
                        ? 'text-warning'
                        : 'text-accent'
                    }`}
                  >
                    ¥{fmt(runningBalance.get(selectedDate) ?? 0)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    今日の残高をベースに、当日までのイベントを反映した予測値
                  </p>
                </div>
              )}
            </>
          ) : (
            // 通常の確定済リスト
            <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              確定済 · 引落待ち
              <span className="text-xs text-gray-400 font-normal ml-1">
                {pendingBills.length}件
              </span>
            </h2>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-md p-0.5 text-[11px]">
              <button
                onClick={() => setBillSort('date')}
                className={`px-2 py-0.5 rounded ${
                  billSort === 'date'
                    ? 'bg-[#b87333] text-white font-semibold'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                日付順
              </button>
              <button
                onClick={() => setBillSort('amount')}
                className={`px-2 py-0.5 rounded ${
                  billSort === 'amount'
                    ? 'bg-[#b87333] text-white font-semibold'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                金額順
              </button>
            </div>
          </div>

          {pendingBills.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              確定済の引落予定はありません
            </p>
          ) : (
            <ul className="space-y-2.5">
              {pendingBills.map((w) => {
                const days = daysUntil(w.withdrawalDate)
                const isUrgent = days <= 7
                const color = cardColorOfId(w.cardId)
                const progress = progressOfCycle({
                  cycleStart: w.cycleStart,
                  cycleEnd: w.cycleEnd,
                  withdrawalDate: w.withdrawalDate,
                })
                const cardName = w.cardId
                  ? cards.find((c) => c.id === w.cardId)?.name ?? '—'
                  : (() => {
                      const t = w.transactions[0]
                      const cat = t
                        ? categories.find((c) => c.id === t.categoryId)?.name ?? ''
                        : ''
                      return t?.memo || cat || '非カード'
                    })()
                return (
                  <li
                    key={`${w.cardId || 'cash'}|${w.withdrawalDate}|${w.transactions[0]?.id ?? ''}`}
                    className="border border-gray-200 dark:border-gray-700 rounded-md p-3.5"
                  >
                    {/* 上段: ブランドバッジ + カード名 + 残日数 */}
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium truncate flex-1">
                        {cardName}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums font-semibold flex-shrink-0 ${
                          isUrgent ? 'text-[#9d3a4a]' : 'text-gray-500'
                        }`}
                      >
                        あと{days}日
                      </span>
                    </div>

                    {/* 中段: 大きな金額 + 件数 */}
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-[22px] font-bold tabular-nums tracking-tight">
                        ¥{fmt(w.total)}
                      </span>
                      <span className="text-[10px] text-gray-400 mb-1">
                        {w.transactions.length}件
                      </span>
                    </div>

                    {/* 下段: 進捗バー + 日付 */}
                    <div className="mt-2.5">
                      <div className="h-1 bg-[#f0e8d8] rounded-full overflow-hidden relative">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: color,
                          }}
                        />
                        <span
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white"
                          style={{
                            left: `calc(${progress}% - 5px)`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[9px] text-gray-400 tabular-nums">
                        <span>{formatMD(w.cycleStart)}</span>
                        <span>{formatMD(w.cycleEnd)}締め</span>
                        <span className="font-semibold" style={{ color }}>
                          {formatMD(w.withdrawalDate)}引落
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
