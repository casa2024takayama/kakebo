import { useState, useRef } from 'react'
import { Upload, Check, AlertCircle } from 'lucide-react'
import { useStore } from '../store'
import { parseCsv } from '../lib/csv'
import type { Transaction } from '../types'

type Preview = Omit<Transaction, 'id'>

export default function Import() {
  const { categories, addTransactions } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<Preview[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const rules = categories.map((c) => ({ keyword: c.name, categoryId: c.id }))

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setDone(false)
    try {
      const rows = await parseCsv(file, rules)
      setPreviews(rows)
      setSelected(new Set(rows.map((_, i) => i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました')
    }
  }

  const toggle = (i: number) => {
    const next = new Set(selected)
    next.has(i) ? next.delete(i) : next.add(i)
    setSelected(next)
  }

  const handleImport = () => {
    const toImport = previews.filter((_, i) => selected.has(i))
    addTransactions(toImport)
    setPreviews([])
    setSelected(new Set())
    setDone(true)
  }

  const updateCategory = (i: number, categoryId: string) => {
    setPreviews((p) => p.map((row, idx) => idx === i ? { ...row, categoryId } : row))
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold mb-2">CSVインポート</h1>
      <p className="text-sm text-gray-400 mb-6">クレカ・銀行の明細CSVをアップロードします</p>

      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 rounded-xl p-5 text-accent hover:bg-accent/5 transition-colors mb-4"
      >
        <Upload size={20} />
        <span className="text-sm font-medium">CSVファイルを選択</span>
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />

      {error && (
        <div className="flex items-start gap-2 text-danger text-sm bg-danger/5 rounded-xl p-3 mb-4">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 text-accent text-sm bg-accent/5 rounded-xl p-3 mb-4">
          <Check size={16} /> インポートが完了しました
        </div>
      )}

      {previews.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-500">{previews.length}件 · {selected.size}件選択中</span>
            <button
              onClick={() => setSelected(selected.size === previews.length ? new Set() : new Set(previews.map((_, i) => i)))}
              className="text-xs text-accent"
            >
              {selected.size === previews.length ? '全解除' : '全選択'}
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {previews.map((row, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl px-4 py-3 shadow-sm border-2 transition-colors ${selected.has(i) ? 'border-accent/30' : 'border-transparent opacity-50'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="accent-accent"
                  />
                  <span className="text-sm font-medium flex-1 truncate">{row.memo || '-'}</span>
                  <span className="text-sm font-semibold">¥{row.amount.toLocaleString('ja-JP')}</span>
                </div>
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-xs text-gray-400">{row.date}</span>
                  <select
                    value={row.categoryId}
                    onChange={(e) => updateCategory(i, e.target.value)}
                    className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:ring-1 focus:ring-accent outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleImport}
            disabled={selected.size === 0}
            className="w-full bg-accent text-white rounded-xl py-3.5 font-semibold disabled:opacity-40"
          >
            {selected.size}件をインポート
          </button>
        </>
      )}
    </div>
  )
}
