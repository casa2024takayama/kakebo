import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Settings as SettingsIcon, AlertTriangle } from 'lucide-react'
import { useStore } from '../store'
import {
  getUpcomingWithdrawals,
  getConcentrationAlerts,
  getDeficitForRange,
} from '../lib/forecast'
import { getCurrentAndNextCycles } from '../lib/payCycle'
import { getAllWithdrawalsInRange } from '../lib/withdrawalDate'

function fmt(n: number): string {
  return n.toLocaleString('ja-JP')
}

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

function statusBadge(status: 'green' | 'yellow' | 'red'): {
  label: string
  bg: string
  fg: string
} {
  switch (status) {
    case 'green':
      return { label: '黒字', bg: 'bg-accent/10', fg: 'text-accent' }
    case 'yellow':
      return { label: 'ギリギリ', bg: 'bg-warning/10', fg: 'text-warning' }
    case 'red':
      return { label: '赤字', bg: 'bg-danger/10', fg: 'text-danger' }
  }
}

export default function Dashboard() {
  const {
    transactions,
    billingGroups,
    cards,
    settings,
    applyFixedCostsIfNeeded,
  } = useStore()

  useEffect(() => {
    applyFixedCostsIfNeeded()
  }, [applyFixedCostsIfNeeded])

  // 当月・翌月の境界
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const currentMonthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const currentMonthEndISO = `${currentMonthEndDate.getFullYear()}-${String(currentMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(currentMonthEndDate.getDate()).padStart(2, '0')}`
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const nextMonthEndDate = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0)
  const nextMonthStartISO = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonthEndISO = `${nextMonthEndDate.getFullYear()}-${String(nextMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthEndDate.getDate()).padStart(2, '0')}`
  const currentMonthLabel = `${today.getFullYear()}年${today.getMonth() + 1}月`
  const nextMonthLabel = `${nextMonthDate.getFullYear()}年${nextMonthDate.getMonth() + 1}月`

  const monthlyIncome = settings.monthlyIncome ?? 0

  // 今月の残り（today 〜 今月末）：信号色なし、情報表示用
  const currentMonthRemaining = useMemo(
    () =>
      getDeficitForRange(
        transactions,
        billingGroups,
        cards,
        0,
        todayISO,
        currentMonthEndISO,
        { evaluateSignal: false },
      ),
    [transactions, billingGroups, cards, todayISO, currentMonthEndISO],
  )

  // 翌月（カレンダー基準）：信号色あり、収入と比較
  const deficit = useMemo(
    () =>
      getDeficitForRange(
        transactions,
        billingGroups,
        cards,
        monthlyIncome,
        nextMonthStartISO,
        nextMonthEndISO,
        { evaluateSignal: true },
      ),
    [transactions, billingGroups, cards, monthlyIncome, nextMonthStartISO, nextMonthEndISO],
  )

  const upcoming = useMemo(
    () => getUpcomingWithdrawals(transactions, billingGroups, cards, today),
    [transactions, billingGroups, cards, today],
  )

  const concentrationAlerts = useMemo(
    () => getConcentrationAlerts(upcoming),
    [upcoming],
  )

  // 記録のみ（excludeFromWithdrawal=true）の件数・合計
  const recordOnly = useMemo(() => {
    const list = transactions.filter(
      (t) => t.kind !== 'bulk' && t.excludeFromWithdrawal === true,
    )
    return {
      count: list.length,
      total: list.reduce((s, t) => s + t.amount, 0),
    }
  }, [transactions])

  const badge = statusBadge(deficit.status)

  // Sprint1: 現サイクルのカード利用累計
  const payDay =
    typeof settings.payDay === 'number' || settings.payDay === 'last'
      ? settings.payDay
      : 15
  const shiftRule = settings.payDayShiftRule ?? 'before'
  const payCycles = useMemo(
    () => getCurrentAndNextCycles(payDay, shiftRule, today),
    [payDay, shiftRule, today],
  )

  const currentCycleUsage = useMemo(() => {
    let total = 0
    for (const t of transactions) {
      if (!t.cardId) continue
      if (t.kind === 'bulk') continue // 利用日基準なので一括は除外
      if (t.excludeFromWithdrawal) continue
      if (t.date >= payCycles.current.start && t.date <= payCycles.current.end) {
        total += t.amount
      }
    }
    return total
  }, [transactions, payCycles])

  const cycleLengthDays = (() => {
    const [sy, sm, sd] = payCycles.current.start.split('-').map(Number)
    const [ey, em, ed] = payCycles.current.end.split('-').map(Number)
    return (
      Math.round(
        (new Date(ey, em - 1, ed).getTime() -
          new Date(sy, sm - 1, sd).getTime()) /
          86400000,
      ) + 1
    )
  })()
  const remainingDays = (() => {
    const [ey, em, ed] = payCycles.current.end.split('-').map(Number)
    const [ty, tm, td] = todayISO.split('-').map(Number)
    return Math.max(
      0,
      Math.round(
        (new Date(ey, em - 1, ed).getTime() -
          new Date(ty, tm - 1, td).getTime()) /
          86400000,
      ) + 1,
    )
  })()
  const dailyAvg =
    cycleLengthDays > 0 ? Math.round(currentCycleUsage / cycleLengthDays) : 0

  // v0.4.13 Stage1: 給料日カード用の計算
  // 「今日〜給料日(=現サイクル末)までの引落合計」と「入金前の残高」を出す
  const payDateISO = payCycles.current.end // 給料日 = 現サイクル末日（実装上）
  const balanceBeforePayday = useMemo(
    () =>
      getDeficitForRange(
        transactions,
        billingGroups,
        cards,
        monthlyIncome,
        todayISO,
        payDateISO,
        { evaluateSignal: true },
      ),
    [transactions, billingGroups, cards, monthlyIncome, todayISO, payDateISO],
  )
  const remainingBalance = monthlyIncome - balanceBeforePayday.totalOut
  const isPositive = remainingBalance >= 0

  // 給料日までの引落件数（カード別 × 引落日 で集約）
  const payDateUpcomingCount = useMemo(
    () =>
      upcoming.filter(
        (f) =>
          f.cycle.total > 0 &&
          f.cycle.withdrawalDate >= todayISO &&
          f.cycle.withdrawalDate <= payDateISO,
      ).length,
    [upcoming, todayISO, payDateISO],
  )

  // v0.4.14 Stage2: 給料日までの引落リスト（カード × 引落日 で集約、日付昇順）
  const upcomingByPayday = useMemo(() => {
    const [ty, tm, td] = todayISO.split('-').map(Number)
    const [py, pm, pd] = payDateISO.split('-').map(Number)
    const todayDate = new Date(ty, tm - 1, td)
    const payDate = new Date(py, pm - 1, pd)
    return getAllWithdrawalsInRange(
      transactions,
      cards,
      billingGroups,
      todayDate,
      payDate,
    )
  }, [transactions, cards, billingGroups, todayISO, payDateISO])

  const cardNameOf = (cardId: string): string =>
    cards.find((c) => c.id === cardId)?.name ?? '—'

  const daysUntil = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number)
    const [ty, tm, td] = todayISO.split('-').map(Number)
    return Math.max(
      0,
      Math.round(
        (new Date(y, m - 1, d).getTime() -
          new Date(ty, tm - 1, td).getTime()) /
          86400000,
      ),
    )
  }

  const dayOfWeekLabel = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number)
    return ['日', '月', '火', '水', '木', '金', '土'][
      new Date(y, m - 1, d).getDay()
    ] + '曜日'
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      {/* v0.4.13 Stage1: 給料日カード（給料日までの収支見通し） */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              給料日まで
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              あと{remainingDays}日 ・ {payDateISO.slice(5).replace('-', '/')}入金予定
            </p>
          </div>
          {monthlyIncome > 0 && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isPositive ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'
              }`}
            >
              {isPositive ? '黒字' : '赤字'}
            </span>
          )}
        </div>

        {monthlyIncome > 0 ? (
          <div className="grid grid-cols-3 gap-2 items-end">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                今日の残高
              </p>
              <p className="text-xl md:text-2xl font-bold tabular-nums tracking-tight mt-1">
                ¥{fmt(monthlyIncome)}
              </p>
            </div>
            <div className="relative">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                給料日までの引落
              </p>
              <p className="text-xl md:text-2xl font-bold tabular-nums tracking-tight mt-1 text-danger">
                −¥{fmt(balanceBeforePayday.totalOut)}
              </p>
              {payDateUpcomingCount > 0 && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {payDateUpcomingCount}件
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                入金前の残高
              </p>
              <p
                className={`text-xl md:text-2xl font-bold tabular-nums tracking-tight mt-1 ${
                  isPositive ? 'text-accent' : 'text-danger'
                }`}
              >
                ¥{fmt(remainingBalance)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            <Link to="/settings" className="text-accent underline">
              設定から月収を入力
            </Link>{' '}
            すると、給料日までの収支見通しが表示されます。
          </p>
        )}
      </section>

      {/* v0.4.14 Stage2: 給料日までの引落リスト */}
      {upcomingByPayday.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              給料日({payDateISO.slice(5).replace('-', '/')})までの引落
            </p>
            <p className="text-[10px] text-gray-400">
              {upcomingByPayday.length}件 ・ 確定済
            </p>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {upcomingByPayday.map((w, i) => {
              const [, m, d] = w.withdrawalDate.split('-')
              const days = daysUntil(w.withdrawalDate)
              return (
                <li
                  key={`${w.cardId}|${w.withdrawalDate}|${i}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <div className="flex-shrink-0 w-12 text-center bg-gray-100 dark:bg-gray-700 rounded-lg py-1">
                    <p className="text-[10px] text-gray-500">
                      {parseInt(m, 10)}月
                    </p>
                    <p className="text-base font-bold tabular-nums leading-none">
                      {parseInt(d, 10)}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {cardNameOf(w.cardId)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      あと{days}日 ・ {dayOfWeekLabel(w.withdrawalDate)}
                    </p>
                  </div>
                  <p className="text-base font-bold tabular-nums tracking-tight flex-shrink-0">
                    ¥{fmt(w.total)}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Sprint1: 現サイクルのカード利用累計 */}
      <section className="bg-accent/5 border border-accent/20 rounded-2xl p-4">
        <p className="text-xs text-accent font-semibold">
          現サイクル（{payCycles.current.start.slice(5).replace('-', '/')}〜
          {payCycles.current.end.slice(5).replace('-', '/')}）で使用
        </p>
        <p className="text-3xl font-bold tracking-tight tabular-nums mt-1">
          ¥{fmt(currentCycleUsage)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
          <div>
            残り <span className="font-semibold tabular-nums">{remainingDays}</span> 日
          </div>
          <div>
            日割平均 <span className="font-semibold tabular-nums">¥{fmt(dailyAvg)}</span>/日
          </div>
        </div>
      </section>

      {/* 引落集中アラート */}
      {concentrationAlerts.length > 0 && (
        <section className="space-y-2">
          {concentrationAlerts.map((a) => (
            <div
              key={a.date}
              className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 flex items-start gap-2"
            >
              <AlertTriangle
                size={16}
                className="text-warning flex-shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-warning">
                  ⚠️ {formatDateLabel(a.date)} に複数着弾
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {a.forecasts.map((f) => f.group.name).join(' / ')} 合計 ¥
                  {fmt(a.total)}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 引落予定（今月の残り + 翌月）— PCで横並び、スマホ縦折り返し */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 今月の残り（信号色なし、情報表示） */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500">
            {currentMonthLabel} の引落（残り）
          </p>
          <p className="text-[10px] text-gray-400">
            {todayISO.slice(5).replace('-', '/')} 〜 {currentMonthEndISO.slice(5).replace('-', '/')}
          </p>
          <p className="text-3xl font-bold tracking-tight tabular-nums mt-2">
            ¥{fmt(currentMonthRemaining.totalOut)}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            今日以降に着弾予定の合計
          </p>
        </div>

        {/* 翌月（信号色あり、収入比較） */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-500">
              {nextMonthLabel} の引落予定
            </p>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.fg}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-3xl font-bold tracking-tight tabular-nums mt-2">
            ¥{fmt(deficit.totalOut)}
          </p>
          <div className="mt-2 text-xs text-gray-500">
            {monthlyIncome > 0 ? (
              <>
                収入 ¥{fmt(deficit.income)} −  ¥{fmt(deficit.totalOut)} ={' '}
                <span
                  className={`font-semibold tabular-nums ${
                    deficit.balance < 0 ? 'text-danger' : 'text-accent'
                  }`}
                >
                  {deficit.balance < 0 ? '−' : '+'}¥{fmt(Math.abs(deficit.balance))}
                </span>
              </>
            ) : (
              <Link to="/settings" className="text-accent underline">
                月収を設定する
              </Link>
            )}
          </div>
        </div>
      </section>

      {recordOnly.count > 0 && (
        <p className="text-xs text-gray-400">
          📝 記録のみ {recordOnly.count}件 ¥{fmt(recordOnly.total)}（引落計算から除外）
        </p>
      )}

      {/* 4請求グループ別の引落予定 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          請求グループ別 次回引落
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-xs text-gray-400">
            請求グループがありません。設定画面から追加してください。
          </p>
        ) : (
          upcoming.map(({ group, cycle }) => (
            <div
              key={group.id}
              className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatDateLabel(cycle.cycleStart)}〜
                  {formatDateLabel(cycle.cycleEnd)} 締め
                </p>
                <p className="text-xs text-gray-500">
                  引落 {formatDateLabel(cycle.withdrawalDate)}
                </p>
              </div>
              <p className="text-lg font-bold tabular-nums">
                ¥{fmt(cycle.total)}
              </p>
            </div>
          ))
        )}
      </section>

      {/* クイックリンク */}
      <section className="grid grid-cols-2 gap-2">
        <Link
          to="/cards"
          className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-2 text-sm"
        >
          <CreditCard size={16} className="text-accent" />
          カード管理
        </Link>
        <Link
          to="/settings"
          className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-2 text-sm"
        >
          <SettingsIcon size={16} className="text-accent" />
          月収・設定
        </Link>
      </section>
    </div>
  )
}
