import { useEffect } from 'react'
import { useStore } from '../store'
import {
  currentMonthKey,
  spentByCategory,
  totalBudget,
  totalSpent,
  remainingDaysInMonth,
  todayBudget,
} from '../lib/budget'

function fmt(n: number): string {
  return n.toLocaleString('ja-JP')
}

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.min(ratio * 100, 100)
  const bg = ratio >= 1 ? '#C0392B' : ratio >= 0.8 ? '#E5972A' : color
  return (
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: bg }}
      />
    </div>
  )
}

export default function Dashboard() {
  const { categories, transactions, applyFixedCostsIfNeeded } = useStore()
  const monthKey = currentMonthKey()

  useEffect(() => {
    applyFixedCostsIfNeeded()
  }, [applyFixedCostsIfNeeded])

  const spent = spentByCategory(transactions, monthKey)
  const budget = totalBudget(categories)
  const total = totalSpent(transactions, monthKey)
  const remaining = budget - total
  const remainingDays = remainingDaysInMonth()
  const todayLimit = todayBudget(remaining)
  const overallRatio = budget > 0 ? total / budget : 0

  const now = new Date()
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      {/* ヘッダー */}
      <div>
        <p className="text-sm text-gray-500">{monthLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight">残り予算</h1>
      </div>

      {/* メイン残高カード */}
      <div
        className={`rounded-2xl p-6 text-white ${
          overallRatio >= 1
            ? 'bg-danger'
            : overallRatio >= 0.8
            ? 'bg-warning'
            : 'bg-accent'
        }`}
      >
        <p className="text-sm opacity-80">今月の残り</p>
        <p className="text-5xl font-bold mt-1">
          ¥{fmt(Math.max(remaining, 0))}
        </p>
        <div className="mt-4 flex justify-between text-sm opacity-80">
          <span>残り{remainingDays}日</span>
          <span>今日の上限 ¥{fmt(todayLimit)}</span>
        </div>
        <div className="mt-3 h-2 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${Math.min(overallRatio * 100, 100)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs opacity-70">
          <span>¥{fmt(total)} 使用</span>
          <span>¥{fmt(budget)} 予算</span>
        </div>
      </div>

      {/* カテゴリ別 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          カテゴリ別
        </h2>
        {categories.map((cat) => {
          const s = spent[cat.id] ?? 0
          const ratio = cat.budget > 0 ? s / cat.budget : 0
          return (
            <div key={cat.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm font-medium">{cat.name}</span>
                  {ratio >= 1 && (
                    <span className="text-xs bg-danger/10 text-danger px-1.5 py-0.5 rounded-full">
                      超過
                    </span>
                  )}
                  {ratio >= 0.8 && ratio < 1 && (
                    <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">
                      注意
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  ¥{fmt(s)} / ¥{fmt(cat.budget)}
                </span>
              </div>
              <ProgressBar ratio={ratio} color={cat.color} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
