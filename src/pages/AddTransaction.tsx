import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, PenLine, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { readReceipt } from '../lib/ai'

export default function AddTransaction() {
  const navigate = useNavigate()
  const { categories, settings, addTransaction } = useStore()
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 'other')
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(amount)
    if (!n || n <= 0) { setError('金額を入力してください'); return }
    addTransaction({ amount: n, categoryId, memo, date, source: 'manual' })
    navigate('/')
  }

  const handleReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!settings.anthropicApiKey) {
      setError('設定画面でAnthropicのAPIキーを入力してください')
      return
    }
    setScanning(true)
    setError('')
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        const result = await readReceipt(settings.anthropicApiKey, base64, file.type)
        setAmount(String(result.amount))
        setMemo(result.memo)
        setDate(result.date)
        setScanning(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setError('レシートの読み取りに失敗しました')
      setScanning(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold mb-6">支出を追加</h1>

      {/* レシート撮影 */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 rounded-xl p-4 mb-6 text-accent hover:bg-accent/5 transition-colors"
        disabled={scanning}
      >
        {scanning ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
        <span className="text-sm font-medium">
          {scanning ? '読み取り中...' : 'レシートを撮影 / 画像を選択'}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleReceipt}
      />

      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <PenLine size={12} /> 手動入力
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">金額（円）</label>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full text-3xl font-bold border-b-2 border-gray-300 focus:border-accent outline-none py-2 bg-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">カテゴリ</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 bg-white focus:ring-2 focus:ring-accent outline-none"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">メモ</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="店名など"
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-accent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">日付</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-accent outline-none"
          />
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full bg-accent text-white rounded-xl py-3.5 font-semibold text-base mt-2 active:opacity-80"
        >
          追加する
        </button>
      </form>
    </div>
  )
}
