import { useState, useRef } from 'react'
import { Upload, Check, AlertCircle } from 'lucide-react'
import { useStore } from '../store'
import { parseCsv, parseSaisonCsv, type SaisonParseResult } from '../lib/csv'
import { getCycleForTransaction } from '../lib/billingCycle'
import type { Transaction } from '../types'

type Preview = Omit<Transaction, 'id'>
type Preset = 'generic' | 'saison'

export default function Import() {
  const {
    categories,
    cards,
    billingGroups,
    addTransaction,
    addTransactions,
    transactions,
    updateTransaction,
  } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preset, setPreset] = useState<Preset>('generic')
  const [previews, setPreviews] = useState<Preview[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // セゾンプリセットの結果保持
  const [saisonResult, setSaisonResult] = useState<SaisonParseResult | null>(null)
  const [matchedCardId, setMatchedCardId] = useState<string>('')
  const [createBulkRecord, setCreateBulkRecord] = useState(true)

  const rules = categories.map((c) => ({ keyword: c.name, categoryId: c.id }))

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setDone(false)
    setPreviews([])
    setSaisonResult(null)
    try {
      if (preset === 'saison') {
        const r = await parseSaisonCsv(file, rules)
        setSaisonResult(r)
        // カード自動マッチング
        const m = cards.find((c) => c.name.includes(r.cardName) || r.cardName.includes(c.name))
        setMatchedCardId(m?.id ?? '')
        setPreviews(r.details)
        setSelected(new Set(r.details.map((_, i) => i)))
      } else {
        const rows = await parseCsv(file, rules)
        setPreviews(rows)
        setSelected(new Set(rows.map((_, i) => i)))
      }
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

    if (preset === 'saison' && saisonResult) {
      const cardId = matchedCardId || undefined
      const stamped: Preview[] = toImport.map((t) => ({ ...t, cardId }))
      addTransactions(stamped)

      // 請求一括レコードの生成 + 重複制御
      if (createBulkRecord && cardId && saisonResult.totalBilled > 0) {
        const card = cards.find((c) => c.id === cardId)
        const group = card
          ? billingGroups.find((g) => g.id === card.billingGroupId)
          : undefined
        if (card && group) {
          // 引落日から請求月を逆算（withdrawalDate の年月をそのまま使う）
          const billingMonth = saisonResult.withdrawalDate
            ? saisonResult.withdrawalDate.slice(0, 7)
            : new Date().toISOString().slice(0, 7)
          const cyc = getCycleForTransaction(`${billingMonth}-15`, group)
          const groupCardIds = cards
            .filter((c) => c.billingGroupId === group.id)
            .map((c) => c.id)
          // 自動的に「個別＝記録のみ」に切替（案3）
          const dupes = transactions
            .filter(
              (t) =>
                t.cardId &&
                groupCardIds.includes(t.cardId) &&
                (t.kind ?? 'individual') === 'individual' &&
                t.excludeFromWithdrawal !== true &&
                t.date >= cyc.cycleStart &&
                t.date <= cyc.cycleEnd,
            )
          // 今追加した stamped も同時に「記録のみ」化したい：addTransactions 後に再取得は煩雑なので、
          // 新規分は kind='individual' で excludeFromWithdrawal=true として直接登録し直すのが綺麗。
          // しかし addTransactions は既に走った後なので、ここでは確認のうえ既存分のみ excludeFromWithdrawal を立てる。
          if (dupes.length > 0) {
            const ok = confirm(
              `この請求期間に既存の個別取引が ${dupes.length}件あります。\n` +
                `これらを「記録のみ（引落計算から除外）」にしますか？`,
            )
            if (ok) {
              for (const d of dupes) {
                updateTransaction({ ...d, excludeFromWithdrawal: true })
              }
            }
          }

          // 今インポートした明細自体も「記録のみ」にする（請求一括が引落計算の真値）
          // → 直近の transactions を取り直す代わりに、「同じカード × 同じ請求月」で
          //    新しく追加された分を全部 excludeFromWithdrawal=true にする
          // ただし addTransactions は内部で id を振っているため、再取得して identify する
          const after = useStore.getState().transactions
          for (const t of after) {
            if (
              t.cardId === cardId &&
              (t.kind ?? 'individual') === 'individual' &&
              t.date >= cyc.cycleStart &&
              t.date <= cyc.cycleEnd &&
              t.excludeFromWithdrawal !== true
            ) {
              updateTransaction({ ...t, excludeFromWithdrawal: true })
            }
          }

          addTransaction({
            amount: saisonResult.totalBilled,
            categoryId: categories[0]?.id ?? 'other',
            memo: `セゾン請求一括（${billingMonth}）`,
            date: saisonResult.withdrawalDate || cyc.withdrawalDate,
            source: 'csv',
            cardId,
            kind: 'bulk',
            billingMonth,
          })
        }
      }
    } else {
      addTransactions(toImport)
    }

    setPreviews([])
    setSelected(new Set())
    setSaisonResult(null)
    setDone(true)
  }

  const updateCategory = (i: number, categoryId: string) => {
    setPreviews((p) => p.map((row, idx) => (idx === i ? { ...row, categoryId } : row)))
  }

  // info メッセージは状態ではなく算出値（カード未マッチ時に動的表示）
  const info =
    preset === 'saison' && saisonResult && !matchedCardId
      ? `カード「${saisonResult.cardName || '(空)'}」が見つかりません。カード管理画面から登録するか、下のドロップダウンで割り当ててください。`
      : ''

  return (
    <div className="px-4 pt-6 pb-32">
      <h1 className="text-2xl font-bold mb-2">CSVインポート</h1>
      <p className="text-sm text-gray-400 mb-4">
        クレカ・銀行の明細CSVをアップロードします（Shift_JIS自動判定対応）
      </p>

      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">カード会社プリセット</label>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 bg-white text-sm"
        >
          <option value="generic">汎用（金額・日付列を自動検出）</option>
          <option value="saison">セゾン（1行目カード名／2行目支払日／3行目合計）</option>
        </select>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-accent/40 rounded-xl p-5 text-accent hover:bg-accent/5 transition-colors mb-4"
      >
        <Upload size={20} />
        <span className="text-sm font-medium">CSVファイルを選択</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFile}
      />

      {error && (
        <div className="flex items-start gap-2 text-danger text-sm bg-danger/5 rounded-xl p-3 mb-4">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {info && (
        <div className="flex items-start gap-2 text-warning text-sm bg-warning/5 rounded-xl p-3 mb-4">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {info}
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 text-accent text-sm bg-accent/5 rounded-xl p-3 mb-4">
          <Check size={16} /> インポートが完了しました
        </div>
      )}

      {saisonResult && (
        <div className="bg-white rounded-xl shadow-sm p-3 mb-4 space-y-2">
          <p className="text-xs text-gray-500">セゾンCSV解析結果</p>
          <div className="text-sm">
            カード名: <span className="font-semibold">{saisonResult.cardName || '-'}</span>
          </div>
          <div className="text-sm">
            支払日: <span className="font-semibold">{saisonResult.withdrawalDate || '-'}</span>
          </div>
          <div className="text-sm">
            請求合計: <span className="font-semibold">¥{saisonResult.totalBilled.toLocaleString('ja-JP')}</span>
          </div>
          <div>
            <label className="text-xs text-gray-500">カード割当</label>
            <select
              value={matchedCardId}
              onChange={(e) => setMatchedCardId(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">未割当（明細のみ取込）</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={createBulkRecord}
              onChange={(e) => setCreateBulkRecord(e.target.checked)}
              className="accent-accent"
            />
            請求一括レコードも作成して、明細を「記録のみ」に切替（案3：重複防止）
          </label>
        </div>
      )}

      {previews.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-500">
              {previews.length}件 · {selected.size}件選択中
            </span>
            <button
              onClick={() =>
                setSelected(
                  selected.size === previews.length
                    ? new Set()
                    : new Set(previews.map((_, i) => i)),
                )
              }
              className="text-xs text-accent"
            >
              {selected.size === previews.length ? '全解除' : '全選択'}
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {previews.map((row, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl px-4 py-3 shadow-sm border-2 transition-colors ${
                  selected.has(i) ? 'border-accent/30' : 'border-transparent opacity-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="accent-accent"
                  />
                  <span className="text-sm font-medium flex-1 truncate">
                    {row.memo || '-'}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      row.amount < 0 ? 'text-accent' : ''
                    }`}
                  >
                    {row.amount < 0 ? '−' : ''}¥{Math.abs(row.amount).toLocaleString('ja-JP')}
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-xs text-gray-400">{row.date}</span>
                  <select
                    value={row.categoryId}
                    onChange={(e) => updateCategory(i, e.target.value)}
                    className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:ring-1 focus:ring-accent outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

        </>
      )}

      {/* sticky な実行バー: 明細リストの長さに関係なく常時画面下部に表示 */}
      {previews.length > 0 && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md lg:max-w-6xl px-4 pointer-events-none z-40">
          <button
            onClick={handleImport}
            disabled={selected.size === 0}
            className="pointer-events-auto w-full bg-accent text-white rounded-xl py-3.5 font-semibold disabled:opacity-40 shadow-lg"
          >
            {selected.size}件をインポート
          </button>
        </div>
      )}
    </div>
  )
}
