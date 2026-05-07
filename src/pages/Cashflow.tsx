/**
 * v0.4.23 Cashflow画面（3ペインレイアウト）— Stage A
 *
 * design-reference/design_handoff_kakebo_cashflow に基づく実装。
 * Stage A では左ペイン4ブロックのみ実装。中央・右はプレースホルダ。
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { getCurrentAndNextCycles } from '../lib/payCycle'
import { buildCashflowSummary } from '../lib/cashflow'

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

  const summary = useMemo(
    () =>
      buildCashflowSummary(
        transactions,
        cards,
        billingGroups,
        monthlyIncome,
        payCycles.current.end,
        today,
      ),
    [transactions, cards, billingGroups, monthlyIncome, payCycles.current.end, today],
  )

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
            {monthlyIncome > 0 ? (
              <>
                <p className="text-3xl md:text-[36px] font-bold tabular-nums tracking-tight mt-1">
                  ¥{fmt(summary.todayBalance)}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {formatMD(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)}({dayOfWeekLabel(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)}) 時点
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-500 mt-2">
                <Link to="/settings" className="text-accent underline">
                  月収を設定
                </Link>{' '}
                すると残高見通しが表示されます。
              </p>
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
            {monthlyIncome > 0 ? (
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
                    <span>今日残高</span>
                    <span>¥{fmt(summary.todayBalance)}</span>
                  </div>
                  <div className="flex justify-between text-danger">
                    <span>− 確定済引落</span>
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
              <p className="text-sm text-gray-400 mt-1">月収未設定</p>
            )}
          </div>
        </aside>

        {/* 中央ペイン：プレースホルダ（Stage Bで実装） */}
        <section className="bg-bg2 rounded-2xl p-5 min-h-[400px] flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-300">
          中央：カレンダー（Stage B で実装予定）
        </section>

        {/* 右ペイン：プレースホルダ（Stage Cで実装） */}
        <aside className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5 min-h-[400px] flex items-center justify-center text-gray-400 text-sm border border-gray-100 dark:border-gray-700">
          右：確定済請求リスト（Stage C で実装予定）
        </aside>
      </div>
    </div>
  )
}
