import Papa from 'papaparse'
import type { Transaction } from '../types'

/**
 * Phase 1.5: ファイルのエンコーディング簡易判定。
 * - UTF-8 BOM があれば utf-8
 * - その他は TextDecoder('utf-8', {fatal:true}) で全バイトをデコードしてみて、失敗するものは Shift_JIS とみなす
 */
async function detectEncodingAndRead(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.slice(3))
  }
  // UTF-8 として fatal でデコード試行
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // Shift_JIS にフォールバック
    try {
      return new TextDecoder('shift_jis').decode(buf)
    } catch {
      return new TextDecoder('utf-8').decode(buf)
    }
  }
}

export async function readFileAsText(file: File): Promise<string> {
  return detectEncodingAndRead(file)
}

function parseAmount(raw: string): number {
  return Math.abs(Number(raw.replace(/[^\d.-]/g, ''))) || 0
}

function parseDate(raw: string): string {
  // YYYY/MM/DD or YYYY-MM-DD or MM/DD/YYYY
  const cleaned = raw.trim()
  if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10).replace(/\//g, '-')
  }
  const parts = cleaned.split('/')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  }
  return new Date().toISOString().slice(0, 10)
}

type RawRow = Record<string, string>

function detectColumns(headers: string[]): { amount: string; date: string; memo: string } | null {
  const lower = headers.map((h) => h.toLowerCase())
  const amountCol = headers[lower.findIndex((h) => /金額|amount|利用額|出金/.test(h))]
  const dateCol = headers[lower.findIndex((h) => /日付|date|利用日|年月日/.test(h))]
  const memoCol = headers[lower.findIndex((h) => /店名|内容|摘要|memo|description|利用先/.test(h))]
  if (!amountCol || !dateCol) return null
  return { amount: amountCol, date: dateCol, memo: memoCol ?? '' }
}

export async function parseCsv(
  file: File,
  categoryRules: Array<{ keyword: string; categoryId: string }>,
): Promise<Omit<Transaction, 'id'>[]> {
  const text = await readFileAsText(file)
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const cols = detectColumns(result.meta.fields ?? [])
        if (!cols) {
          reject(new Error('対応できない列構成です。金額・日付の列が必要です。'))
          return
        }
        const transactions: Omit<Transaction, 'id'>[] = result.data.map((row) => {
          const memo = cols.memo ? row[cols.memo] ?? '' : ''
          const categoryId =
            categoryRules.find((r) => memo.includes(r.keyword))?.categoryId ?? 'other'
          return {
            amount: parseAmount(row[cols.amount] ?? '0'),
            date: parseDate(row[cols.date] ?? ''),
            memo,
            categoryId,
            source: 'csv' as const,
          }
        })
        resolve(transactions.filter((t) => t.amount > 0))
      },
      error: reject,
    })
  })
}

// ===== Phase 1.5: セゾンCSVプリセット =====

export type SaisonParseResult = {
  cardName: string
  withdrawalDate: string // YYYY-MM-DD（取れなければ空）
  totalBilled: number
  details: Omit<Transaction, 'id'>[]
}

function parseDateLoose(raw: string): string {
  const cleaned = raw.replace(/[年月.]/g, '/').replace(/日/g, '').trim()
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(cleaned)) {
    const [y, m, d] = cleaned.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return parseDate(raw)
}

/**
 * セゾンCSVを以下の前提で取込：
 * - 1行目：カード名
 * - 2行目：支払日（引落日）
 * - 3行目：請求金額合計
 * - 4行目：（空行 or ヘッダ）
 * - 5行目以降：明細
 *   - 明細列の最低限：日付・店舗・金額
 *   - 海外取引の2行構成（OPENAI 等の次行に補足）はメモに連結
 *   - マイナス金額（返金）は負の値で記録
 */
export async function parseSaisonCsv(
  file: File,
  categoryRules: Array<{ keyword: string; categoryId: string }>,
): Promise<SaisonParseResult> {
  const text = await readFileAsText(file)
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false })
  const rows = parsed.data as string[][]

  const cardName = (rows[0]?.[0] ?? '').trim()
  const withdrawalDate = parseDateLoose(
    (rows[1]?.[1] ?? rows[1]?.[0] ?? '').trim(),
  )
  const totalBilled =
    Math.abs(
      Number(
        ((rows[2]?.[1] ?? rows[2]?.[0] ?? '0') as string).replace(/[^\d.-]/g, ''),
      ),
    ) || 0

  // 明細の開始行を探す（ヘッダ行が来るまで）
  let detailStart = 4
  for (let i = 3; i < Math.min(rows.length, 12); i++) {
    const cell = (rows[i]?.[0] ?? '').trim()
    if (/利用日|ご利用日|日付/.test(cell)) {
      detailStart = i + 1
      break
    }
  }

  const details: Omit<Transaction, 'id'>[] = []
  for (let i = detailStart; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const dateRaw = (row[0] ?? '').trim()
    const memoRaw = (row[1] ?? '').trim()
    const amountRaw = (row[2] ?? row[row.length - 1] ?? '').trim()

    if (!dateRaw && memoRaw && details.length > 0) {
      // 海外取引などの補足行 → 直前の明細のメモへ連結
      const last = details[details.length - 1]
      last.memo = `${last.memo} / ${memoRaw}`.trim()
      continue
    }
    if (!dateRaw && !memoRaw) continue

    const sign = amountRaw.includes('-') ? -1 : 1
    const amount = Number(amountRaw.replace(/[^\d.]/g, '')) * sign
    if (!Number.isFinite(amount) || amount === 0) continue

    const categoryId =
      categoryRules.find((r) => memoRaw.includes(r.keyword))?.categoryId ??
      'other'

    details.push({
      amount,
      date: parseDateLoose(dateRaw),
      memo: memoRaw,
      categoryId,
      source: 'csv',
      kind: 'individual',
    })
  }

  return { cardName, withdrawalDate, totalBilled, details }
}

