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

/**
 * 金額をパース。マイナス符号は保持する（返金行が負の値で来る）。
 * パース不能な場合は NaN を返す（呼び出し側で除外判定）。
 */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

/**
 * 日付をパース。失敗時は null を返す（呼び出し側で行を弾く）。
 * 「今日」を勝手に入れる挙動は禁止。
 */
function parseDate(raw: string): string | null {
  const cleaned = raw.trim()
  if (!cleaned) return null
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(cleaned)) {
    const m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (!m) return null
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  const parts = cleaned.split('/')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  }
  return null
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
        const transactions: Omit<Transaction, 'id'>[] = []
        for (const row of result.data) {
          const memo = cols.memo ? row[cols.memo] ?? '' : ''
          const categoryId =
            categoryRules.find((r) => memo.includes(r.keyword))?.categoryId ?? 'other'
          const amount = parseAmount(row[cols.amount] ?? '')
          const date = parseDate(row[cols.date] ?? '')
          // 日付/金額がパースできない行は黙って捨てる（呼び出し側で件数差分が分かる）
          if (date === null || !Number.isFinite(amount) || amount === 0) continue
          transactions.push({
            amount,
            date,
            memo,
            categoryId,
            source: 'csv' as const,
          })
        }
        resolve(transactions)
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

/**
 * v0.4.9: カード名の正規化（ゆるい一致のため）。
 * カード会社の固有名（イオン/セゾン/JCB/楽天等）だけ残して、
 * グレード（ゴールド/プラチナ）やブランド（VISA/MASTER/AMEX）、
 * 装飾語（カード/American Express/・/（））を取り除く。
 *
 * 例:
 *   「イオンゴールド」 → 「いおん」
 *   「イオンカード（ゴールド）」 → 「いおん」
 *   「セゾンゴールド・アメリカン・エキスプレス・カード」 → 「せぞん」
 */
export function normalizeCardName(s: string): string {
  if (!s) return ''
  return s
    .normalize('NFKC')
    .toLowerCase()
    // ブランド・グレード・装飾語を除去
    .replace(
      /カード|card|ゴールド|gold|プラチナ|platinum|アメリカン・?エキスプレス|アメックス|american\s*express|amex|visa|master|mastercard|jcb|プレミアム|premium/g,
      '',
    )
    // 記号・括弧・スペースを除去
    .replace(/[（）()・\s]/g, '')
    .trim()
}

/**
 * 取込CSVのカード名と既存登録カードの名前のゆるい一致判定。
 * 完全一致 / 部分一致（正規化後）どちらでもOK。
 */
export function matchCardByName<T extends { name: string }>(
  csvCardName: string,
  cards: T[],
): T | undefined {
  // (1) 元の文字列で部分一致（既存挙動の互換）
  const direct = cards.find(
    (c) => c.name.includes(csvCardName) || csvCardName.includes(c.name),
  )
  if (direct) return direct
  // (2) 正規化して部分一致
  const a = normalizeCardName(csvCardName)
  if (!a) return undefined
  return cards.find((c) => {
    const b = normalizeCardName(c.name)
    if (!b) return false
    return a.includes(b) || b.includes(a)
  })
}

/**
 * セゾンCSVヘッダ部からカード名を柔軟に抽出。
 * 1行目固定の rows[0][0] では脆弱なので、以下の順で探す：
 * 1. 「カード名称」「カード名」ラベル行の右セル
 * 2. 「カード」を含むセル（短すぎないもの）
 * 3. フォールバック: rows[0][0]
 */
function extractSaisonCardName(rows: string[][]): string {
  // 明細ヘッダ前まで（最大10行）を探索範囲に
  const limit = Math.min(rows.length, 10)
  // (1) ラベル行（カード名称 / カード名 / ご利用カード等）
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? []
    for (let j = 0; j < row.length; j++) {
      const cell = (row[j] ?? '').trim()
      if (/^(ご利用カード|カード名称|カード名|カード)$/.test(cell)) {
        const right = (row[j + 1] ?? '').trim()
        if (right) return right
      }
    }
  }
  // (2) 「カード」を含む長いセル
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? []
    for (const c of row) {
      const v = (c ?? '').trim()
      if (v.length > 3 && /カード|Card/i.test(v)) return v
    }
  }
  // (3) フォールバック
  return (rows[0]?.[0] ?? '').trim()
}

/**
 * セゾンCSVヘッダ部から、ラベル正規表現にマッチするセルの右セルの値を返す。
 */
function extractSaisonByLabel(rows: string[][], labelRe: RegExp): string | null {
  const limit = Math.min(rows.length, 15)
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? []
    for (let j = 0; j < row.length; j++) {
      const cell = (row[j] ?? '').trim()
      if (labelRe.test(cell)) {
        const right = (row[j + 1] ?? '').trim()
        if (right) return right
      }
    }
  }
  return null
}

function parseDateLoose(raw: string): string | null {
  const trimmed = raw.trim().normalize('NFKC')
  // v0.4.7: YYMMDD 6桁圧縮形式（イオンCSV「260311」など）
  if (/^\d{6}$/.test(trimmed)) {
    const yy = trimmed.slice(0, 2)
    const mm = trimmed.slice(2, 4)
    const dd = trimmed.slice(4, 6)
    const m = parseInt(mm, 10)
    const d = parseInt(dd, 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `20${yy}-${mm}-${dd}`
    }
  }
  // v0.4.11: より堅牢な抽出。
  // 年月日表記（半角・全角・スペース・記号混在）に対応するため、
  // 文字列の中から「YYYY ?? MM ?? DD」という3つの数値ブロックを正規表現で抜き出す。
  // 例: "2026年 5月 7日" / "2026/5/7" / "2026.05.07" / "2026年5月7日" 全てヒット
  const m = trimmed.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    const moNum = parseInt(mo, 10)
    const dNum = parseInt(d, 10)
    if (moNum >= 1 && moNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
  }
  // 連続表記（YYYY/MM/DD、YYYY-MM-DDなど区切りつき）
  const cleaned = trimmed
    .replace(/[年月.]/g, '/')
    .replace(/日/g, '')
    .replace(/\s+/g, '')
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(cleaned)) {
    const [y, mo, d] = cleaned.split('/')
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
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

  // カード名: ヘッダ行に到達するまでの行から「カード」「Card」を含むセルや、
  // 「カード名称」というラベル行の右セルを探す。固定の[0][0]に依存しない。
  const cardName = extractSaisonCardName(rows)
  // v0.4.12: 支払日ラベルに「い」が入る変種（イオン「お支払い日」）に対応。
  // 「お?支払い?日」で以下4パターンすべてマッチ: 支払日 / 支払い日 / お支払日 / お支払い日
  const withdrawalDateRaw = extractSaisonByLabel(rows, /お?支払い?日|引落|引き落とし/)
    ?? (rows[1]?.[1] ?? rows[1]?.[0] ?? '').trim()
  const withdrawalDate = parseDateLoose(withdrawalDateRaw) ?? ''
  // 請求合計: 「ご請求金額」「請求金額」「お支払い金額」ラベルの右、または3行目フォールバック
  const totalRaw = extractSaisonByLabel(rows, /請求金額|お?支払い?金額|今回|合計/)
    ?? (rows[2]?.[1] ?? rows[2]?.[0] ?? '0')
  const totalParsed = parseAmount(totalRaw)
  const totalBilled = Number.isFinite(totalParsed) ? Math.abs(totalParsed) : 0

  // 明細の開始行を探す（ヘッダ行が来るまで）と、ヘッダから列インデックスを動的検出
  let detailStart = 4
  let dateCol = 0
  let memoCol = 1
  let amountCol = -1
  for (let i = 3; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] ?? []
    const firstCell = (row[0] ?? '').trim()
    if (/利用日|ご利用日|日付/.test(firstCell)) {
      detailStart = i + 1
      // ヘッダ列をスキャン
      for (let j = 0; j < row.length; j++) {
        const h = (row[j] ?? '').trim()
        if (/利用日|ご利用日|日付/.test(h)) dateCol = j
        else if (/利用店名|店舗|商品名|店名|内容|摘要|利用先/.test(h)) memoCol = j
        else if (/利用金額|金額|請求額|支払金額/.test(h)) amountCol = j
      }
      break
    }
  }
  // amountCol が見つからなければ、明細1行目を試走して数値が入っている列を採用
  if (amountCol === -1 && rows[detailStart]) {
    const probe = rows[detailStart]
    for (let j = probe.length - 1; j >= 2; j--) {
      const v = (probe[j] ?? '').trim().replace(/[^\d.-]/g, '')
      if (v && Number.isFinite(Number(v)) && Number(v) !== 0) {
        amountCol = j
        break
      }
    }
    if (amountCol === -1) amountCol = 5 // セゾン既定
  }

  const details: Omit<Transaction, 'id'>[] = []
  for (let i = detailStart; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const dateRaw = (row[dateCol] ?? '').trim()
    const memoRaw = (row[memoCol] ?? '').trim()
    const amountRaw = (row[amountCol] ?? '').trim()

    if (!dateRaw && memoRaw && details.length > 0) {
      // 海外取引などの補足行 → 直前の明細のメモへ連結
      const last = details[details.length - 1]
      last.memo = `${last.memo} / ${memoRaw}`.trim()
      continue
    }
    if (!dateRaw && !memoRaw) continue

    const amount = parseAmount(amountRaw)
    if (!Number.isFinite(amount) || amount === 0) continue

    const date = parseDateLoose(dateRaw)
    if (date === null) continue // 日付パース失敗行は捨てる（勝手に今日を入れない）

    const categoryId =
      categoryRules.find((r) => memoRaw.includes(r.keyword))?.categoryId ??
      'other'

    details.push({
      amount,
      date,
      memo: memoRaw,
      categoryId,
      source: 'csv',
      kind: 'individual',
      // v0.4.3: CSVに記載された実引落日を全明細に自動付与（請求遅延の繰越分も正しく5/7扱いに）
      ...(withdrawalDate ? { actualWithdrawalDate: withdrawalDate } : {}),
    })
  }

  return { cardName, withdrawalDate, totalBilled, details }
}

