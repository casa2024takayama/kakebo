import { useState, useRef, useEffect } from 'react'
import { Upload, Check, AlertCircle, History, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { parseCsv, parseSaisonCsv, type SaisonParseResult } from '../lib/csv'
import { getCycleForTransaction } from '../lib/billingCycle'
import { storage, type ImportLogEntry } from '../lib/storage'
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
  const [fileName, setFileName] = useState<string>('')
  const [logs, setLogs] = useState<ImportLogEntry[]>([])
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    setLogs(storage.getImportLog())
  }, [])

  const rules = categories.map((c) => ({ keyword: c.name, categoryId: c.id }))

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setDone(false)
    setPreviews([])
    setSaisonResult(null)
    setFileName(file.name)
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
    const skippedCount = previews.length - toImport.length
    let bulkCreated = false

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
          // v0.4.5: 重複制御を「実引落日(actualWithdrawalDate)基準」に変更。
          // 旧来の「理論サイクル期間 [cycleStart, cycleEnd]」基準だと、
          // 請求遅延でCSVに含まれる前期繰越分（利用日が前サイクル）が範囲外で漏れていた。
          // → 同じ実引落日に着弾する個別を確実に「記録のみ」化する。
          const targetWd = saisonResult.withdrawalDate || cyc.withdrawalDate
          const dupes = transactions
            .filter(
              (t) =>
                t.cardId &&
                groupCardIds.includes(t.cardId) &&
                (t.kind ?? 'individual') === 'individual' &&
                t.excludeFromWithdrawal !== true &&
                t.actualWithdrawalDate === targetWd,
            )
          if (dupes.length > 0) {
            const ok = confirm(
              `この引落日(${targetWd})に着弾する既存の個別取引が ${dupes.length}件あります。\n` +
                `これらを「記録のみ（引落計算から除外）」にしますか？`,
            )
            if (ok) {
              for (const d of dupes) {
                updateTransaction({ ...d, excludeFromWithdrawal: true })
              }
            }
          }

          // 今インポートした明細自体も「記録のみ」にする（請求一括が引落計算の真値）
          // 個別明細には parseSaisonCsv で actualWithdrawalDate=targetWd が付与済み
          const after = useStore.getState().transactions
          for (const t of after) {
            if (
              t.cardId === cardId &&
              (t.kind ?? 'individual') === 'individual' &&
              t.actualWithdrawalDate === targetWd &&
              t.excludeFromWithdrawal !== true
            ) {
              updateTransaction({ ...t, excludeFromWithdrawal: true })
            }
          }

          addTransaction({
            amount: saisonResult.totalBilled,
            categoryId: categories[0]?.id ?? 'other',
            memo: `セゾン請求一括（${billingMonth}）`,
            date: targetWd,
            // v0.4.5: 実引落日を明示。これがないと computeDerivedDates が
            // billingMonth から理論計算してしまい、bulkの引落日が誤った日(例:7/6)になる。
            actualWithdrawalDate: targetWd,
            source: 'csv',
            cardId,
            kind: 'bulk',
            billingMonth,
          })
          bulkCreated = true
        }
      }
    } else {
      addTransactions(toImport)
    }

    // インポート履歴記録
    storage.appendImportLog({
      ts: new Date().toISOString(),
      preset,
      fileName: fileName || '(unknown)',
      cardName: saisonResult?.cardName,
      detailsCount: toImport.length,
      skippedCount,
      bulkCreated,
      totalBilled: bulkCreated ? saisonResult?.totalBilled : undefined,
      note:
        preset === 'saison' && previews.length === 0 && !bulkCreated
          ? '明細0件・一括レコードも作成しなかったため何も保存されませんでした'
          : undefined,
    })
    setLogs(storage.getImportLog())

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

      {/* 明細0件の警告（セゾンCSV解析後） */}
      {saisonResult && previews.length === 0 && (
        <div className="flex items-start gap-2 text-warning text-sm bg-warning/5 rounded-xl p-3 mb-4">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            明細が0件です。CSVの列構造が想定と異なる可能性があります。
            「請求一括レコードも作成」をONにすれば、合計額のみを登録できます（カード割当が必要）。
          </div>
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

      {/* インポート履歴 */}
      <div className="mt-6 mb-4">
        <button
          onClick={() => setShowLog((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <History size={14} />
          インポート履歴 ({logs.length})
          <span className="text-gray-400">{showLog ? '▲' : '▼'}</span>
        </button>
        {showLog && (
          <div className="mt-2 space-y-1.5">
            {logs.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-3">履歴はまだありません。</p>
            ) : (
              <>
                {logs.slice(0, 30).map((log, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-xs shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium truncate">{log.fileName}</span>
                      <span className="text-gray-400 flex-shrink-0">
                        {new Date(log.ts).toLocaleString('ja-JP', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-gray-500 mt-1">
                      {log.preset === 'saison' ? 'セゾン' : '汎用'}
                      {log.cardName ? ` · ${log.cardName}` : ''}
                      {' · '}明細{log.detailsCount}件
                      {log.skippedCount > 0 ? ` (${log.skippedCount}件除外)` : ''}
                      {log.bulkCreated
                        ? ` · 一括¥${(log.totalBilled ?? 0).toLocaleString('ja-JP')}`
                        : ''}
                    </div>
                    {log.note && (
                      <p className="text-warning mt-1">{log.note}</p>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => {
                    if (confirm('インポート履歴を全削除しますか？取引データには影響しません。')) {
                      storage.clearImportLog()
                      setLogs([])
                    }
                  }}
                  className="text-xs text-gray-400 hover:text-danger flex items-center gap-1 mt-2"
                >
                  <Trash2 size={12} /> 履歴をクリア
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* sticky な実行バー: 明細あり OR セゾン一括作成可能（previews=0でも合計>0 + カード割当ありなら表示） */}
      {(previews.length > 0 ||
        (preset === 'saison' &&
          saisonResult &&
          createBulkRecord &&
          matchedCardId &&
          saisonResult.totalBilled > 0)) && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md lg:max-w-6xl px-4 pointer-events-none z-40">
          <button
            onClick={handleImport}
            disabled={previews.length > 0 && selected.size === 0}
            className="pointer-events-auto w-full bg-accent text-white rounded-xl py-3.5 font-semibold disabled:opacity-40 shadow-lg"
          >
            {previews.length > 0
              ? `${selected.size}件をインポート`
              : `請求一括¥${(saisonResult?.totalBilled ?? 0).toLocaleString('ja-JP')}を登録`}
          </button>
        </div>
      )}
    </div>
  )
}
