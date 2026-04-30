import Papa from 'papaparse'
import type { Transaction } from '../types'

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

export function parseCsv(
  file: File,
  categoryRules: Array<{ keyword: string; categoryId: string }>,
): Promise<Omit<Transaction, 'id'>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
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
