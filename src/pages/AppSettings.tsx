import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Download, ChevronRight, Moon } from 'lucide-react'
import { useStore } from '../store'

export default function AppSettings() {
  const navigate = useNavigate()
  const { settings, transactions, setSettings } = useStore()
  const [apiKey, setApiKey] = useState(settings.anthropicApiKey)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const saveKey = () => {
    setSettings({ ...settings, anthropicApiKey: apiKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `kakebo_${new Date().toISOString().slice(0,10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const exportCsv = () => {
    const header = '日付,金額,カテゴリID,メモ'
    const rows = transactions.map((t) => `${t.date},${t.amount},${t.categoryId},${t.memo}`)
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `kakebo_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      {/* APIキー */}
      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">Anthropic APIキー</h2>
        <p className="text-xs text-gray-400">レシート読み取りに使用します。キーはこのデバイスにのみ保存されます。</p>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent outline-none font-mono"
          />
          <button onClick={() => setShowKey((v) => !v)} className="text-gray-400 hover:text-gray-600 px-2">
            {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <button
          onClick={saveKey}
          className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            saved ? 'bg-green-500 text-white' : 'bg-accent text-white'
          }`}
        >
          {saved ? '保存しました ✓' : '保存'}
        </button>
      </section>

      {/* ダークモード */}
      <section className="bg-white rounded-xl shadow-sm p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Moon size={16} className="text-gray-500" /> ダークモード
          </span>
          <input
            type="checkbox"
            checked={settings.darkMode}
            onChange={(e) => setSettings({ ...settings, darkMode: e.target.checked })}
            className="w-5 h-5 accent-accent"
          />
        </label>
      </section>

      {/* 予算設定へのリンク */}
      <section className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        <button
          onClick={() => navigate('/budget')}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium"
        >
          予算・カテゴリ設定 <ChevronRight size={16} className="text-gray-400" />
        </button>
        <button
          onClick={() => navigate('/fixed')}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium"
        >
          固定費管理 <ChevronRight size={16} className="text-gray-400" />
        </button>
      </section>

      {/* エクスポート */}
      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">データエクスポート</h2>
        <div className="flex gap-2">
          <button
            onClick={exportJson}
            className="flex-1 flex items-center justify-center gap-1.5 border border-accent/40 text-accent rounded-lg py-2.5 text-sm font-medium hover:bg-accent/5"
          >
            <Download size={15} /> JSON
          </button>
          <button
            onClick={exportCsv}
            className="flex-1 flex items-center justify-center gap-1.5 border border-accent/40 text-accent rounded-lg py-2.5 text-sm font-medium hover:bg-accent/5"
          >
            <Download size={15} /> CSV
          </button>
        </div>
      </section>
    </div>
  )
}
