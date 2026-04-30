import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { FixedCost } from '../types'

function uid() { return Math.random().toString(36).slice(2) }

export default function FixedCosts() {
  const { fixedCosts, categories, setFixedCosts } = useStore()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 'other')
  const [day, setDay] = useState('1')

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(amount)
    if (!name.trim() || !n) return
    const fc: FixedCost = { id: uid(), name: name.trim(), amount: n, categoryId, day: Number(day) }
    setFixedCosts([...fixedCosts, fc])
    setName(''); setAmount(''); setDay('1')
  }

  const remove = (id: string) => setFixedCosts(fixedCosts.filter((f) => f.id !== id))

  const total = fixedCosts.reduce((s, f) => s + f.amount, 0)
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-2xl font-bold">固定費</h1>
        <span className="text-sm text-gray-500">月 ¥{total.toLocaleString('ja-JP')}</span>
      </div>
      <p className="text-sm text-gray-400 mb-6">毎月1日に自動で計上されます</p>

      {fixedCosts.length === 0 && (
        <p className="text-center text-gray-400 mb-6">固定費が登録されていません</p>
      )}

      <div className="space-y-2 mb-6">
        {fixedCosts.map((fc) => (
          <div key={fc.id} className="bg-white rounded-xl px-4 py-3.5 shadow-sm flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{fc.name}</p>
              <p className="text-xs text-gray-400">毎月{fc.day}日 · {catMap[fc.categoryId]?.name}</p>
            </div>
            <span className="text-sm font-semibold">¥{fc.amount.toLocaleString('ja-JP')}</span>
            <button onClick={() => remove(fc.id)} className="text-gray-300 hover:text-danger transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">固定費を追加</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前（例：家賃、Netflix）"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-accent outline-none"
        />
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="金額"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-accent outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            min="1" max="28"
            placeholder="日"
            className="w-16 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-accent outline-none"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-accent outline-none bg-white"
        >
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="submit"
          className="w-full bg-accent text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1"
        >
          <Plus size={16} /> 追加
        </button>
      </form>
    </div>
  )
}
