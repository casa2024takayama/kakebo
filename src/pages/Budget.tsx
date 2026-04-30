import { useState } from 'react'
import { Plus, Trash2, Check, X } from 'lucide-react'
import { useStore } from '../store'
import type { Category } from '../types'

const COLORS = ['#1A6B4A','#2980B9','#8E44AD','#E5972A','#E74C3C','#7F8C8D','#16A085','#D35400']

function uid() { return Math.random().toString(36).slice(2) }

export default function Budget() {
  const { categories, setCategories } = useStore()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Category>>({})

  const startEdit = (cat: Category) => {
    setEditing(cat.id)
    setDraft({ name: cat.name, budget: cat.budget, color: cat.color })
  }

  const saveEdit = (id: string) => {
    setCategories(categories.map((c) => c.id === id ? { ...c, ...draft } as Category : c))
    setEditing(null)
  }

  const deleteCategory = (id: string) => {
    if (categories.length <= 1) return
    setCategories(categories.filter((c) => c.id !== id))
  }

  const addCategory = () => {
    const newCat: Category = { id: uid(), name: '新しいカテゴリ', budget: 10000, color: COLORS[categories.length % COLORS.length] }
    setCategories([...categories, newCat])
    setEditing(newCat.id)
    setDraft({ name: newCat.name, budget: newCat.budget, color: newCat.color })
  }

  const total = categories.reduce((s, c) => s + c.budget, 0)

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">予算設定</h1>
        <span className="text-sm text-gray-500">合計 ¥{total.toLocaleString('ja-JP')}</span>
      </div>
      <p className="text-sm text-gray-400 mb-6">カテゴリ名をタップして編集できます</p>

      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
            {editing === cat.id ? (
              <div className="p-4 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, color }))}
                      className={`w-7 h-7 rounded-full border-2 ${draft.color === color ? 'border-gray-700 scale-110' : 'border-transparent'} transition-transform`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={draft.name ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent outline-none"
                  placeholder="カテゴリ名"
                />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">¥</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.budget ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, budget: Number(e.target.value) }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent outline-none"
                    placeholder="月の上限金額"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(cat.id)} className="flex-1 bg-accent text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1">
                    <Check size={14} /> 保存
                  </button>
                  <button onClick={() => setEditing(null)} className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1">
                    <X size={14} /> キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                onClick={() => startEdit(cat)}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 text-sm font-medium">{cat.name}</span>
                <span className="text-sm text-gray-500">¥{cat.budget.toLocaleString('ja-JP')}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id) }}
                  className="text-gray-300 hover:text-danger transition-colors ml-2"
                  aria-label="削除"
                >
                  <Trash2 size={15} />
                </button>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addCategory}
        className="mt-4 w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 rounded-xl p-3.5 text-accent hover:bg-accent/5 transition-colors text-sm font-medium"
      >
        <Plus size={18} /> カテゴリを追加
      </button>
    </div>
  )
}
