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
import { getAllWithdrawalsInRange, computeDerivedDates } from '../lib/withdrawalDate'

function fmt(n: number): string {
  return n.toLocaleString('ja-JP')
}

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

export default function Dashboard() {
  const {
    transactions,
    billingGroups,
    cards,
    categories,
    settings,
    applyFixedCostsIfNeeded,
  } = useStore()

  useEffect(() => {
    applyFixedCostsIfNeeded()
  }, [applyFixedCostsIfNeeded])

  // 当月・翌月の境界
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const monthlyIncome = settings.monthlyIncome ?? 0

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
      if (t.excludeFromWithdrawal) continue
      // v0.4.19: 非カード取引も含める（社長指示）
      // - カード: billingPeriodが現サイクルと重なる AND 引落日が現サイクル末より後
      // - 非カード: 利用日が現サイクル内（=その日に出た出費）
      if (!t.cardId) {
        if (t.date >= payCycles.current.start && t.date <= payCycles.current.end) {
          total += t.amount
        }
        continue
      }
      const derived = computeDerivedDates(t, billingGroups, cards)
      if (!derived) continue
      if (derived.withdrawalDate <= payCycles.current.end) continue
      const overlap =
        derived.cycleStart <= payCycles.current.end &&
        derived.cycleEnd >= payCycles.current.start
      if (!overlap) continue
      total += t.amount
    }
    return total
  }, [transactions, payCycles, billingGroups, cards])

  // v0.4.19: 非カード取引の進行中サイクル集計（カード別バーの下に表示）
  const currentCycleNonCard = useMemo(() => {
    let count = 0
    let total = 0
    for (const t of transactions) {
      if (t.excludeFromWithdrawal) continue
      if (t.cardId) continue
      if (t.date >= payCycles.current.start && t.date <= payCycles.current.end) {
        count += 1
        total += t.amount
      }
    }
    return { count, total }
  }, [transactions, payCycles])

  // v0.4.15 Stage3: 進行中サイクルのカード別利用累計
  const currentCycleUsageByCard = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) {
      if (!t.cardId) continue
      if (t.excludeFromWithdrawal) continue
      // v0.4.18: computeDerivedDates 経由で統一処理。
      const derived = computeDerivedDates(t, billingGroups, cards)
      if (!derived) continue
      if (derived.withdrawalDate <= payCycles.current.end) continue
      const overlap =
        derived.cycleStart <= payCycles.current.end &&
        derived.cycleEnd >= payCycles.current.start
      if (!overlap) continue
      map.set(t.cardId, (map.get(t.cardId) ?? 0) + t.amount)
    }
    const arr = Array.from(map.entries())
      .map(([cardId, total]) => ({
        cardId,
        cardName: cards.find((c) => c.id === cardId)?.name ?? '—',
        color: cards.find((c) => c.id === cardId)?.color ?? '#7a6d5e',
        total,
      }))
      .sort((a, b) => b.total - a.total)
    return arr
  }, [transactions, payCycles, cards])

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
  // v0.4.15 Stage3: サイクル進捗% (今日が現サイクルのどこにいるか)
  const cycleProgress = (() => {
    if (cycleLengthDays <= 0) return 0
    const passed = cycleLengthDays - remainingDays
    return Math.min(100, Math.max(0, Math.round((passed / cycleLengthDays) * 100)))
  })()
  const cycleMaxPerCard = currentCycleUsageByCard.reduce(
    (m, c) => Math.max(m, c.total),
    0,
  )

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

  // v0.4.19: 件数は upcomingByPayday（取引ベース）から正確に算出
  // 旧来は upcoming（グループベース）で件数が削除に追従しないバグがあった

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
    <div className="px-4 pt-6 pb-4 space-y-4 lg:space-y-6">
      {/* v0.4.16 Stage4: トップ2カラム（給料日 / 進行中サイクル） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

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
              {upcomingByPayday.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {upcomingByPayday.length}件
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

      {/* v0.4.15 Stage3: 進行中サイクル + カード別利用バー */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
        <div className="flex items-start justify-between mb-1">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            進行中サイクル
          </p>
          <p className="text-[10px] text-gray-400 tabular-nums">
            {payCycles.current.start.slice(5).replace('-', '/')} 〜{' '}
            {payCycles.current.end.slice(5).replace('-', '/')}
          </p>
        </div>
        <p className="text-[11px] text-gray-500">
          次の給料日サイクル末に引かれる予定
        </p>

        <div className="flex items-end justify-between mt-3">
          <p className="text-2xl md:text-3xl font-bold tabular-nums tracking-tight">
            ¥{fmt(currentCycleUsage)}
          </p>
          <p className="text-[10px] text-gray-500">
            サイクル進捗 <span className="font-semibold tabular-nums">{cycleProgress}%</span>
          </p>
        </div>
        {/* 全体プログレスバー */}
        <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-bronze-500"
            style={{ width: `${cycleProgress}%`, backgroundColor: '#b87333' }}
          />
        </div>

        {/* カード別バー */}
        {currentCycleUsageByCard.length > 0 && (
          <ul className="mt-3 space-y-2">
            {currentCycleUsageByCard.map((c) => {
              const pct =
                cycleMaxPerCard > 0
                  ? Math.round((c.total / cycleMaxPerCard) * 100)
                  : 0
              return (
                <li
                  key={c.cardId}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="flex-shrink-0 w-20 truncate">{c.cardName}</span>
                  <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  </div>
                  <span className="flex-shrink-0 tabular-nums w-20 text-right">
                    ¥{fmt(c.total)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {/* 非カード取引（住宅ローン・サブスク等）— 集約1行 */}
        {currentCycleNonCard.count > 0 && (
          <ul className="mt-2 space-y-2">
            <li className="flex items-center gap-2 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-400" />
              <span className="flex-shrink-0 w-20 truncate text-gray-500">
                非カード取引
              </span>
              <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-400"
                  style={{
                    width: `${
                      cycleMaxPerCard > 0
                        ? Math.min(100, Math.round((currentCycleNonCard.total / cycleMaxPerCard) * 100))
                        : 100
                    }%`,
                  }}
                />
              </div>
              <span className="flex-shrink-0 tabular-nums w-20 text-right text-gray-600">
                {currentCycleNonCard.count}件 ¥{fmt(currentCycleNonCard.total)}
              </span>
            </li>
          </ul>
        )}

        {/* 末尾の合計表示 */}
        {(currentCycleUsageByCard.length > 0 || currentCycleNonCard.count > 0) && (
          <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs">
            <span className="text-gray-500">合計</span>
            <span className="font-bold tabular-nums">¥{fmt(currentCycleUsage)}</span>
          </div>
        )}

        {currentCycleUsageByCard.length === 0 && currentCycleNonCard.count === 0 && (
          <p className="text-xs text-gray-400 mt-2">
            このサイクルにカード利用・非カード取引がまだありません。
          </p>
        )}
      </section>

      </div>{/* end トップ2カラム */}

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
                    {/* v0.4.20: 非カードはカテゴリ＋メモを表示。カードはカード名。 */}
                    {(() => {
                      if (w.cardId) {
                        return (
                          <p className="text-sm font-medium truncate">
                            {cardNameOf(w.cardId)}
                          </p>
                        )
                      }
                      const t = w.transactions[0]
                      const cat = t ? categories.find((c) => c.id === t.categoryId) : undefined
                      const label = cat?.name ?? '非カード'
                      return (
                        <p className="text-sm font-medium truncate">
                          <span className="text-xs text-gray-500 mr-1">{label}</span>
                          {t?.memo || '—'}
                        </p>
                      )
                    })()}
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

      {/* v0.4.16: 旧「現サイクル使用累計」は Stage3 進行中サイクルに統合 */}

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

      {/* v0.4.16: 旧「今月残り/翌月の引落予定」は Stage1 給料日カードに統合 */}

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
