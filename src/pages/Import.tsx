import { useState, useRef, useEffect } from 'react'
import { Upload, Check, AlertCircle, History, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import {
  parseCsv,
  parseSaisonCsv,
  parseMizuhoCsv,
  matchCardByName,
  type SaisonParseResult,
  type MizuhoRow,
} from '../lib/csv'
import { getCycleForTransaction } from '../lib/billingCycle'
import { storage, type ImportLogEntry } from '../lib/storage'
import type { Transaction } from '../types'

type Preview = Omit<Transaction, 'id'>
type Preset = 'generic' | 'saison' | 'aeon' | 'mizuho'

export default function Import() {
  const {
    categories,
    cards,
    billingGroups,
    addTransaction,
    addTransactions,
    transactions,
    updateTransaction,
    deleteTransaction,
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

  // v0.4.28: みずほ銀行CSVプリセット
  const [mizuhoRows, setMizuhoRows] = useState<MizuhoRow[]>([])
  // 行ごとに「取込ON/OFF」と「カテゴリ上書き」を管理
  const [mizuhoSelected, setMizuhoSelected] = useState<Set<string>>(new Set())
  const [mizuhoCategoryOverride, setMizuhoCategoryOverride] = useState<Record<string, string>>({})
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
    setMizuhoRows([])
    setMizuhoSelected(new Set())
    setMizuhoCategoryOverride({})
    setFileName(file.name)
    try {
      if (preset === 'saison' || preset === 'aeon') {
        const r = await parseSaisonCsv(file, rules)
        setSaisonResult(r)
        // v0.4.9: カード自動マッチング（正規化ベース）
        // 「イオンゴールド」と「イオンカード（ゴールド）」のような表記揺れを吸収
        const m = matchCardByName(r.cardName, cards)
        setMatchedCardId(m?.id ?? '')
        setPreviews(r.details)
        setSelected(new Set(r.details.map((_, i) => i)))
      } else if (preset === 'mizuho') {
        const r = await parseMizuhoCsv(file)
        setMizuhoRows(r.rows)
        // v0.4.33: CSVヘッダから残高スナップショット保存（取込ボタン待たずに即時）
        if (r.snapshot) {
          storage.upsertBankSnapshot({
            id: `mizuho_${r.snapshot.date}`,
            source: 'mizuho',
            date: r.snapshot.date,
            amount: r.snapshot.amount,
            importedAt: new Date().toISOString(),
            note: 'みずほ銀行CSV',
          })
        }
        // 既存トランザクションとの重複検出: cardBilling のうち
        // 同じ日に同じカード会社の bulk が存在する場合は OFF（C3: カード+日付一致で判定）
        const existingBulkKeys = new Set(
          transactions
            .filter((t) => t.kind === 'bulk' && t.cardId)
            .map((t) => {
              const cardName = cards.find((c) => c.id === t.cardId)?.name ?? ''
              return `${t.actualWithdrawalDate ?? t.date}|${cardName}`
            }),
        )
        const initSelected = new Set<string>()
        for (const row of r.rows) {
          if (row.classification === 'cardBilling' && row.cardKeyword) {
            const matched = matchCardByName(row.cardKeyword, cards)
            const dedupKey = matched ? `${row.date}|${matched.name}` : ''
            if (existingBulkKeys.has(dedupKey)) continue // 重複→OFF
          }
          initSelected.add(row.id)
        }
        setMizuhoSelected(initSelected)
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

    if ((preset === 'saison' || preset === 'aeon') && saisonResult) {
      const cardId = matchedCardId || undefined
      const card = cardId ? cards.find((c) => c.id === cardId) : undefined
      const group = card
        ? billingGroups.find((g) => g.id === card.billingGroupId)
        : undefined
      // 支払日がCSVに無いケース（AEON形式など）では、明細利用日の最大日から理論引落日を推定する
      const inferredFromDetails = (() => {
        if (!group || toImport.length === 0) return null
        const sortedUsageDates = [...toImport]
          .map((t) => t.date)
          .sort((a, b) => a.localeCompare(b))
        const latestUsageDate = sortedUsageDates[sortedUsageDates.length - 1]
        if (!latestUsageDate) return null
        return getCycleForTransaction(latestUsageDate, group)
      })()
      const targetWd =
        saisonResult.withdrawalDate ||
        inferredFromDetails?.withdrawalDate ||
        ''
      const billingMonth =
        targetWd.slice(0, 7) ||
        inferredFromDetails?.withdrawalDate.slice(0, 7) ||
        new Date().toISOString().slice(0, 7)
      // v0.4.11: 重複検出 - 既存と (date, amount, memo, cardId) が一致するレコードはスキップ
      const existingKeys = new Set(
        transactions
          .filter((t) => (t.kind ?? 'individual') === 'individual')
          .map((t) => `${t.date}|${t.amount}|${t.memo}|${t.cardId ?? ''}`),
      )
      const stamped: Preview[] = toImport
        .map((t) => ({
          ...t,
          cardId,
          ...(targetWd && (t.kind ?? 'individual') === 'individual'
            ? { actualWithdrawalDate: targetWd }
            : {}),
        }))
        .filter(
          (t) =>
            !existingKeys.has(
              `${t.date}|${t.amount}|${t.memo}|${t.cardId ?? ''}`,
            ),
        )
      addTransactions(stamped)

      // 請求一括レコードの生成 + 重複制御
      if (createBulkRecord && cardId && saisonResult.totalBilled > 0) {
        if (card && group) {
          const groupCardIds = cards
            .filter((c) => c.billingGroupId === group.id)
            .map((c) => c.id)
          // v0.4.5: 重複制御を「実引落日(actualWithdrawalDate)基準」に変更。
          // 旧来の「理論サイクル期間 [cycleStart, cycleEnd]」基準だと、
          // 請求遅延でCSVに含まれる前期繰越分（利用日が前サイクル）が範囲外で漏れていた。
          // → 同じ実引落日に着弾する個別を確実に「記録のみ」化する。
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

          // v0.4.10: 既存の同一(カード × 請求月)のbulkを削除して上書き。
          // v0.4.7以前で作られた壊れたbulk（actualWithdrawalDateが誤った値）が
          // 残ると二重計上になるため、再取込時に必ずクリーンアップする。
          const stateNow = useStore.getState()
          const existingBulks = stateNow.transactions.filter(
            (t) =>
              t.kind === 'bulk' &&
              t.cardId === cardId &&
              (t.billingMonth === billingMonth ||
                (t.billingPeriod && t.billingPeriod.start.startsWith(billingMonth)) ||
                (t.billingPeriod && t.billingPeriod.end.startsWith(billingMonth))),
          )
          for (const ob of existingBulks) {
            deleteTransaction(ob.id)
          }

          addTransaction({
            amount: saisonResult.totalBilled,
            categoryId: categories[0]?.id ?? 'other',
            memo: `${card.name}請求一括（${billingMonth}）`,
            date: targetWd || new Date().toISOString().slice(0, 10),
            // v0.4.5: 実引落日を明示。これがないと computeDerivedDates が
            // billingMonth から理論計算してしまい、bulkの引落日が誤った日(例:7/6)になる。
            ...(targetWd ? { actualWithdrawalDate: targetWd } : {}),
            source: 'csv',
            cardId,
            kind: 'bulk',
            billingMonth,
          })
          bulkCreated = true
        }
      }
    } else if (preset === 'mizuho') {
      // v0.4.28: みずほ銀行CSV取込
      // 選択された行のみを Transaction に変換して追加
      const otherCatId = categories.find((c) => c.id === 'other')?.id ?? categories[0]?.id ?? 'other'
      const toAdd: Preview[] = []
      for (const row of mizuhoRows) {
        if (!mizuhoSelected.has(row.id)) continue
        // cardBilling は通常スキップ（既に bulk で計上）。ユーザーが明示的に選択した場合のみ追加。
        const memoPrefix =
          row.classification === 'paypayCharge'
            ? '[PayPay引落]'
            : row.classification === 'atmWithdraw'
            ? '[現金引出]'
            : row.classification === 'income'
            ? '[入金]'
            : row.classification === 'cardBilling'
            ? `[${row.cardKeyword ?? 'カード'}引落]`
            : ''
        const memo = memoPrefix ? `${memoPrefix} ${row.description}`.trim() : row.description
        const categoryId = mizuhoCategoryOverride[row.id] ?? otherCatId
        if (row.classification === 'income') {
          toAdd.push({
            amount: row.amount,
            categoryId: '',
            memo,
            date: row.date,
            source: 'csv',
            kind: 'income',
          })
        } else {
          // 出金系 → 非カード個別取引
          toAdd.push({
            amount: row.amount,
            categoryId,
            memo,
            date: row.date,
            source: 'csv',
            kind: 'individual',
          })
        }
      }
      // 重複検出（既存 transactions と同じ memo+date+amount は除外）
      const existingKeys = new Set(
        transactions.map((t) => `${t.date}|${t.amount}|${t.memo}`),
      )
      const deduped = toAdd.filter(
        (t) => !existingKeys.has(`${t.date}|${t.amount}|${t.memo}`),
      )
      addTransactions(deduped)
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
        (preset === 'saison' || preset === 'aeon') && previews.length === 0 && !bulkCreated
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
    (preset === 'saison' || preset === 'aeon') && saisonResult && !matchedCardId
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
          <option value="saison">セゾン（明細CSV）</option>
          <option value="aeon">イオン（明細CSV）</option>
          <option value="mizuho">みずほ銀行（口座取引CSV）</option>
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

      {/* v0.4.28: みずほ銀行プレビュー */}
      {preset === 'mizuho' && mizuhoRows.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {mizuhoRows.length}件 · {mizuhoSelected.size}件取込
              {mizuhoRows.length - mizuhoSelected.size > 0 &&
                ` · ${mizuhoRows.length - mizuhoSelected.size}件スキップ`}
            </span>
            <button
              onClick={() =>
                setMizuhoSelected(
                  mizuhoSelected.size === mizuhoRows.length
                    ? new Set()
                    : new Set(mizuhoRows.map((r) => r.id)),
                )
              }
              className="text-xs text-accent"
            >
              {mizuhoSelected.size === mizuhoRows.length ? '全解除' : '全選択'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            ・<span className="text-amber-600">カード引落</span> は既存bulk(同日同カード)あれば自動OFF<br />
            ・<span className="text-accent">給与/入金</span> は収入として登録<br />
            ・<span className="text-blue-600">PayPay引落</span> ・ <span className="text-purple-600">ATM引出</span> ・ その他は非カード個別取引
          </p>

          {mizuhoRows.map((r) => {
            const isSel = mizuhoSelected.has(r.id)
            const badge =
              r.classification === 'cardBilling'
                ? { label: 'カード引落', color: 'bg-amber-100 text-amber-700' }
                : r.classification === 'paypayCharge'
                ? { label: 'PayPay引落', color: 'bg-blue-100 text-blue-700' }
                : r.classification === 'income'
                ? { label: '入金/給与', color: 'bg-accent/10 text-accent' }
                : r.classification === 'atmWithdraw'
                ? { label: 'ATM引出', color: 'bg-purple-100 text-purple-700' }
                : { label: 'その他', color: 'bg-gray-100 text-gray-600' }
            return (
              <div
                key={r.id}
                className={`bg-white rounded-lg px-3 py-2 shadow-sm border-2 transition-colors ${
                  isSel ? 'border-accent/30' : 'border-transparent opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => {
                      const next = new Set(mizuhoSelected)
                      isSel ? next.delete(r.id) : next.add(r.id)
                      setMizuhoSelected(next)
                    }}
                    className="accent-accent flex-shrink-0"
                  />
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-xs flex-1 truncate">{r.description}</span>
                  <span
                    className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                      r.isOutgoing ? '' : 'text-accent'
                    }`}
                  >
                    {r.isOutgoing ? '−' : '+'}¥{r.amount.toLocaleString('ja-JP')}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 pl-6 text-[10px] text-gray-400 tabular-nums">
                  <span>{r.date}</span>
                  {r.classification !== 'cardBilling' && r.classification !== 'income' && (
                    <select
                      value={mizuhoCategoryOverride[r.id] ?? 'other'}
                      onChange={(e) =>
                        setMizuhoCategoryOverride({
                          ...mizuhoCategoryOverride,
                          [r.id]: e.target.value,
                        })
                      }
                      className="ml-auto text-[10px] border border-gray-200 rounded px-1 bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )
          })}
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
                      {log.preset === 'saison'
                        ? 'セゾン'
                        : log.preset === 'aeon'
                        ? 'イオン'
                        : log.preset === 'mizuho'
                        ? 'みずほ銀行'
                        : '汎用'}
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

      {/* sticky な実行バー: 明細あり OR セゾン一括作成可能 OR みずほ */}
      {(previews.length > 0 ||
        ((preset === 'saison' || preset === 'aeon') &&
          saisonResult &&
          createBulkRecord &&
          matchedCardId &&
          saisonResult.totalBilled > 0) ||
        (preset === 'mizuho' && mizuhoRows.length > 0)) && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md lg:max-w-6xl px-4 pointer-events-none z-40">
          <button
            onClick={handleImport}
            disabled={
              (previews.length > 0 && selected.size === 0) ||
              (preset === 'mizuho' && mizuhoSelected.size === 0)
            }
            className="pointer-events-auto w-full bg-accent text-white rounded-xl py-3.5 font-semibold disabled:opacity-40 shadow-lg"
          >
            {preset === 'mizuho'
              ? `${mizuhoSelected.size}件をインポート（みずほ銀行）`
              : previews.length > 0
              ? `${selected.size}件をインポート`
              : `請求一括¥${(saisonResult?.totalBilled ?? 0).toLocaleString('ja-JP')}を登録`}
          </button>
        </div>
      )}
    </div>
  )
}
