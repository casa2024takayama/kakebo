import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Download, Upload, ChevronRight, Moon, AlertCircle, Check } from 'lucide-react'
import { useStore } from '../store'
import { storage } from '../lib/storage'
import type { BankSnapshot } from '../types'

// v0.4.35: バックアップversion 2 = bankSnapshots を含む
const BACKUP_VERSION = 2

type BackupPayload = {
  app: 'kakebo'
  version: number
  exportedAt: string
  appVersion: string
  data: {
    categories: ReturnType<typeof useStore.getState>['categories']
    transactions: ReturnType<typeof useStore.getState>['transactions']
    fixedCosts: ReturnType<typeof useStore.getState>['fixedCosts']
    settings: ReturnType<typeof useStore.getState>['settings']
    billingGroups: ReturnType<typeof useStore.getState>['billingGroups']
    cards: ReturnType<typeof useStore.getState>['cards']
    /** v0.4.35: 銀行残高スナップショット（v2以降） */
    bankSnapshots?: BankSnapshot[]
  }
}

export default function AppSettings() {
  const navigate = useNavigate()
  const {
    settings,
    transactions,
    categories,
    fixedCosts,
    billingGroups,
    cards,
    setSettings,
    setCategories,
    setTransactions,
    setFixedCosts,
    setBillingGroups,
    setCards,
  } = useStore()
  const restoreFileRef = useRef<HTMLInputElement>(null)
  const [restoreMsg, setRestoreMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [apiKey, setApiKey] = useState(settings.anthropicApiKey)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [income, setIncome] = useState(String(settings.monthlyIncome ?? 0))
  const [incomeSaved, setIncomeSaved] = useState(false)
  const [payDay, setPayDay] = useState<string>(
    settings.payDay === 'last' ? 'last' : String(settings.payDay ?? 15),
  )
  const [shiftRule, setShiftRule] = useState<'before' | 'after' | 'none'>(
    settings.payDayShiftRule ?? 'before',
  )
  const [paySaved, setPaySaved] = useState(false)

  const saveIncome = () => {
    const n = Math.max(0, Math.floor(Number(income) || 0))
    setSettings({ ...settings, monthlyIncome: n })
    setIncomeSaved(true)
    setTimeout(() => setIncomeSaved(false), 2000)
  }

  const savePayDay = () => {
    const pd: number | 'last' =
      payDay === 'last'
        ? 'last'
        : Math.min(31, Math.max(1, Math.floor(Number(payDay) || 15)))
    setSettings({ ...settings, payDay: pd, payDayShiftRule: shiftRule })
    setPaySaved(true)
    setTimeout(() => setPaySaved(false), 2000)
  }

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

  // v0.4.3: フルバックアップ（全データ）
  // v0.4.35: bankSnapshots を追加
  const exportBackup = () => {
    const bankSnapshots = storage.getBankSnapshots()
    const payload: BackupPayload = {
      app: 'kakebo',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: __APP_VERSION__,
      data: { categories, transactions, fixedCosts, settings, billingGroups, cards, bankSnapshots },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kakebo_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRestoreMsg(null)
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as BackupPayload
      if (payload.app !== 'kakebo') {
        throw new Error('kakeboのバックアップファイルではありません')
      }
      if (typeof payload.version !== 'number' || payload.version > BACKUP_VERSION) {
        throw new Error(`このバージョンのバックアップ(v${payload.version})は復元できません`)
      }
      const counts = {
        categories: payload.data.categories?.length ?? 0,
        transactions: payload.data.transactions?.length ?? 0,
        fixedCosts: payload.data.fixedCosts?.length ?? 0,
        billingGroups: payload.data.billingGroups?.length ?? 0,
        cards: payload.data.cards?.length ?? 0,
        bankSnapshots: payload.data.bankSnapshots?.length ?? 0,
      }
      const ok = confirm(
        `バックアップを復元します。\n\n` +
          `エクスポート: ${new Date(payload.exportedAt).toLocaleString('ja-JP')}\n` +
          `アプリ版: ${payload.appVersion ?? '?'}\n\n` +
          `カテゴリ ${counts.categories} / 取引 ${counts.transactions}\n` +
          `固定費 ${counts.fixedCosts} / グループ ${counts.billingGroups} / カード ${counts.cards}\n` +
          `銀行残高スナップショット ${counts.bankSnapshots}\n\n` +
          `現在のデータは全て上書きされます。続行しますか？`,
      )
      if (!ok) {
        if (restoreFileRef.current) restoreFileRef.current.value = ''
        return
      }
      // 全置換（順序：カテゴリ→グループ→カード→固定費→取引→設定→スナップショット）
      if (payload.data.categories) setCategories(payload.data.categories)
      if (payload.data.billingGroups) setBillingGroups(payload.data.billingGroups)
      if (payload.data.cards) setCards(payload.data.cards)
      if (payload.data.fixedCosts) setFixedCosts(payload.data.fixedCosts)
      if (payload.data.transactions) setTransactions(payload.data.transactions)
      // v0.4.35: 銀行残高スナップショットも復元（v2バックアップ以降）
      if (payload.data.bankSnapshots) {
        storage.saveBankSnapshots(payload.data.bankSnapshots)
      }
      if (payload.data.settings) setSettings(payload.data.settings)
      setRestoreMsg({
        type: 'ok',
        text: `復元しました（取引 ${counts.transactions} 件 / カード ${counts.cards} 枚）`,
      })
    } catch (err) {
      setRestoreMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '復元に失敗しました',
      })
    } finally {
      if (restoreFileRef.current) restoreFileRef.current.value = ''
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      {/* 月収 */}
      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">月収（手取り）</h2>
        <p className="text-xs text-gray-400">
          翌月の引落予定との差分を計算するために使用します。
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            placeholder="例: 350000"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent outline-none tabular-nums"
          />
          <button
            onClick={saveIncome}
            className={`rounded-lg px-4 text-sm font-semibold transition-colors ${
              incomeSaved ? 'bg-green-500 text-white' : 'bg-accent text-white'
            }`}
          >
            {incomeSaved ? '✓' : '保存'}
          </button>
        </div>
      </section>

      {/* 給料日 */}
      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">給料日</h2>
        <p className="text-xs text-gray-400">
          家計サイクルの起点に使用します。休業日は指定ルールでシフト。
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={payDay}
            onChange={(e) => setPayDay(e.target.value)}
            placeholder="15 または last"
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent outline-none tabular-nums"
          />
          <select
            value={shiftRule}
            onChange={(e) =>
              setShiftRule(e.target.value as 'before' | 'after' | 'none')
            }
            className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          >
            <option value="before">前営業日繰上</option>
            <option value="after">翌営業日繰下</option>
            <option value="none">シフトしない</option>
          </select>
          <button
            onClick={savePayDay}
            className={`rounded-lg px-4 text-sm font-semibold transition-colors ${
              paySaved ? 'bg-green-500 text-white' : 'bg-accent text-white'
            }`}
          >
            {paySaved ? '✓' : '保存'}
          </button>
        </div>
      </section>

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

      {/* テストモード（v0.4.4） */}
      <section className="bg-white rounded-xl shadow-sm p-4 space-y-2">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle size={16} className="text-danger" /> テストモード
          </span>
          <input
            type="checkbox"
            checked={settings.testMode ?? false}
            onChange={(e) => setSettings({ ...settings, testMode: e.target.checked })}
            className="w-5 h-5 accent-danger"
          />
        </label>
        <p className="text-xs text-gray-500 leading-relaxed">
          ON時、ページロード毎に <strong>取引と固定費を自動削除</strong> します。
          カード・グループ・カテゴリ・設定は保持されます。
          バックアップから復元すれば実データに戻せます。
        </p>
      </section>

      {/* 予算設定へのリンク */}
      <section className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        <button
          onClick={() => navigate('/cards')}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium"
        >
          カード・請求グループ管理 <ChevronRight size={16} className="text-gray-400" />
        </button>
        <button
          onClick={() => navigate('/import')}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium"
        >
          CSVインポート <ChevronRight size={16} className="text-gray-400" />
        </button>
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

      {/* フルバックアップ・復元（v0.4.3） */}
      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">バックアップ・復元（全データ）</h2>
        <p className="text-xs text-gray-400">
          設定・カード・グループ・取引・固定費を含む全データを1ファイルに書き出し、必要時に復元します。
          テスト時のリセット対策や端末移行に。
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportBackup}
            className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-white rounded-lg py-2.5 text-sm font-semibold"
          >
            <Download size={15} /> バックアップ書き出し
          </button>
          <button
            onClick={() => restoreFileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 border border-accent/40 text-accent rounded-lg py-2.5 text-sm font-medium hover:bg-accent/5"
          >
            <Upload size={15} /> 復元
          </button>
          <input
            ref={restoreFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onRestoreFile}
          />
        </div>
        {restoreMsg && (
          <div
            className={`flex items-start gap-2 text-xs rounded-lg p-2.5 ${
              restoreMsg.type === 'ok'
                ? 'bg-accent/5 text-accent'
                : 'bg-danger/5 text-danger'
            }`}
          >
            {restoreMsg.type === 'ok' ? (
              <Check size={14} className="flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            )}
            <span>{restoreMsg.text}</span>
          </div>
        )}
      </section>

      {/* 単独エクスポート（取引のみ・既存機能） */}
      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">取引のみエクスポート</h2>
        <p className="text-xs text-gray-400">外部分析向け。設定・カード等は含まれません。</p>
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
