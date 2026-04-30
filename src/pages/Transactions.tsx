import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { currentMonthKey } from '../lib/budget'

export default function Transactions() {
  const { transactions, categories, deleteTransaction } = useStore()
  const [monthKey, setMonthKey] = useState(currentMonthKey())

  const filtered = transactions
    .filter((t) => t.date.startsWith(monthKey))
    .sort((a, b) => b.date.localeCompare(a.date))

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">取引一覧</h1>
        <input
          type="month"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-accent outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 mt-16">この月の取引はありません</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const cat = catMap[t.categoryId]
            return (
              <div key={t.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat?.color ?? '#ccc' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.memo || cat?.name || '-'}</p>
                  <p className="text-xs text-gray-400">{t.date} · {cat?.name}</p>
                </div>
                <span className="text-sm font-semibold text-right flex-shrink-0">
                  ¥{t.amount.toLocaleString('ja-JP')}
                </span>
                <button
                  onClick={() => deleteTransaction(t.id)}
                  className="text-gray-300 hover:text-danger transition-colors flex-shrink-0"
                  aria-label="削除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
