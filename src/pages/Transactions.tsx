import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { computeDerivedDates } from '../lib/withdrawalDate'
import { getCurrentAndNextCycles } from '../lib/payCycle'
import type { Transaction } from '../types'

type Filter = 'all' | 'current' | 'next' | 'individual' | 'bulk' | 'recordOnly'
type SortBy = 'dateDesc' | 'dateAsc' | 'billing' | 'withdrawal'
type ViewMode = 'usage' | 'withdrawal'

function monthDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

export default function Transactions() {
  const {
    transactions,
    categories,
    cards,
    billingGroups,
    settings,
    deleteTransaction,
  } = useStore()

  const [filter, setFilter] = useState<Filter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('dateDesc')
  const [viewMode, setViewMode] = useState<ViewMode>('usage')

  const payDay =
    typeof settings.payDay === 'number' || settings.payDay === 'last'
      ? settings.payDay
      : 15
  const shiftRule = settings.payDayShiftRule ?? 'before'
  const cycles = useMemo(
    () => getCurrentAndNextCycles(payDay, shiftRule),
    [payDay, shiftRule],
  )

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const cardMap = Object.fromEntries(cards.map((c) => [c.id, c]))

  type Enriched = {
    t: Transaction
    derived: ReturnType<typeof computeDerivedDates>
  }

  const enriched: Enriched[] = useMemo(
    () =>
      transactions.map((t) => ({
        t,
        derived: computeDerivedDates(t, billingGroups, cards),
      })),
    [transactions, billingGroups, cards],
  )

  const filtered = useMemo(() => {
    return enriched.filter(({ t, derived }) => {
      if (filter === 'individual') {
        if ((t.kind ?? 'individual') !== 'individual') return false
      } else if (filter === 'bulk') {
        if (t.kind !== 'bulk') return false
      } else if (filter === 'recordOnly') {
        if (!t.excludeFromWithdrawal) return false
      } else if (filter === 'current') {
        // v0.4.14: サイクルフィルタは引落日基準で固定（viewModeに依存しない）。
        // 引落日が無い（カード未割当の現金等）は利用日にフォールバック。
        const refDate = derived ? derived.withdrawalDate : t.date
        if (refDate < cycles.current.start || refDate > cycles.current.end)
          return false
      } else if (filter === 'next') {
        const refDate = derived ? derived.withdrawalDate : t.date
        if (refDate < cycles.next.start || refDate > cycles.next.end)
          return false
      }
      return true
    })
  }, [enriched, filter, cycles])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      if (sortBy === 'dateDesc') return b.t.date.localeCompare(a.t.date)
      if (sortBy === 'dateAsc') return a.t.date.localeCompare(b.t.date)
      if (sortBy === 'billing') {
        const ae = a.derived?.cycleEnd ?? a.t.date
        const be = b.derived?.cycleEnd ?? b.t.date
        return ae.localeCompare(be)
      }
      // withdrawal
      const aw = a.derived?.withdrawalDate ?? a.t.date
      const bw = b.derived?.withdrawalDate ?? b.t.date
      return aw.localeCompare(bw)
    })
    return arr
  }, [filtered, sortBy])

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold">取引一覧</h1>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 text-xs">
          <button
            onClick={() => setViewMode('usage')}
            className={`px-2 py-1 rounded ${
              viewMode === 'usage' ? 'bg-white shadow-sm font-semibold' : 'text-gray-500'
            }`}
          >
            利用日基準
          </button>
          <button
            onClick={() => setViewMode('withdrawal')}
            className={`px-2 py-1 rounded ${
              viewMode === 'withdrawal' ? 'bg-white shadow-sm font-semibold' : 'text-gray-500'
            }`}
          >
            引落日基準
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-2 text-xs">
        {(
          [
            ['all', 'すべて'],
            ['current', '現サイクル'],
            ['next', '次サイクル'],
            ['individual', '個別のみ'],
            ['bulk', '一括のみ'],
            ['recordOnly', '記録のみ'],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded-full border ${
              filter === k
                ? 'bg-accent text-white border-accent'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs text-gray-500">ソート:</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
        >
          <option value="dateDesc">利用日↓</option>
          <option value="dateAsc">利用日↑</option>
          <option value="billing">請求期間別</option>
          <option value="withdrawal">引落日順</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-gray-400 mt-16">該当する取引はありません</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(({ t, derived }) => {
            const cat = catMap[t.categoryId]
            const card = t.cardId ? cardMap[t.cardId] : undefined
            const isBulk = t.kind === 'bulk'
            const isRecordOnly = t.excludeFromWithdrawal === true
            return (
              <div
                key={t.id}
                className="bg-white dark:bg-gray-800 rounded-xl px-3 py-2.5 shadow-sm flex items-start gap-3"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                  style={{ backgroundColor: cat?.color ?? '#ccc' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {t.memo || cat?.name || '-'}
                    </p>
                    {isBulk && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 rounded px-1.5">
                        一括
                      </span>
                    )}
                    {isRecordOnly && (
                      <span className="text-[10px] bg-gray-200 text-gray-600 rounded px-1.5">
                        記録のみ
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="tabular-nums">
                      利用 {monthDay(t.date)}
                    </span>
                    {card && <span>· {card.name}</span>}
                    {cat && <span>· {cat.name}</span>}
                    {derived && (
                      <>
                        <span className="bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5 tabular-nums">
                          請求 {monthDay(derived.cycleStart)}〜{monthDay(derived.cycleEnd)}
                        </span>
                        <span className="bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 tabular-nums">
                          引落 {monthDay(derived.withdrawalDate)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    ¥{t.amount.toLocaleString('ja-JP')}
                  </span>
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    className="text-gray-300 hover:text-danger transition-colors mt-1"
                    aria-label="削除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
