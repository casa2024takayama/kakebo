import type {
  Category,
  Transaction,
  FixedCost,
  Settings,
  BillingGroup,
  Card,
  BankSnapshot,
} from '../types'

const KEYS = {
  categories: 'kakebo_categories',
  transactions: 'kakebo_transactions',
  fixedCosts: 'kakebo_fixed_costs',
  settings: 'kakebo_settings',
  lastFixedApplied: 'kakebo_last_fixed_applied',
  billingGroups: 'kakebo_billing_groups',
  cards: 'kakebo_cards',
  /** Sprint1: マイグレーション完了フラグ */
  migrationV03: 'kakebo_migration_v0_3',
  /** Sprint1: 利用日/引落日混在の警告を1度だけ出すためのフラグ */
  warnedMixedDates: 'kakebo_warned_mixed_dates',
  /** Timeline: ユーザーが表示するカードのフィルタ設定 */
  timelineFilter: 'kakebo_timeline_filter',
  /** v0.4.2: CSVインポート履歴ログ */
  importLog: 'kakebo_import_log',
  /** v0.4.8: bulkレコードに actualWithdrawalDate 補完 */
  migrationV048: 'kakebo_migration_v0_4_8',
  /** v0.4.21: 旧apollostationグループをニコス（旧シェル）に補正 */
  migrationV0421: 'kakebo_migration_v0_4_21',
  /** v0.4.33: 銀行残高スナップショット */
  bankSnapshots: 'kakebo_bank_snapshots',
}

export type ImportLogEntry = {
  /** ISO timestamp */
  ts: string
  /** プリセット名 */
  preset: 'generic' | 'saison' | 'aeon' | 'mizuho'
  /** 元ファイル名 */
  fileName: string
  /** カード名（セゾンのみ） */
  cardName?: string
  /** 取込された明細件数 */
  detailsCount: number
  /** 解析されたが取込しなかった件数（チェックを外した分） */
  skippedCount: number
  /** 請求一括レコード作成有無 */
  bulkCreated: boolean
  /** 請求合計（セゾンのみ、bulk作成時） */
  totalBilled?: number
  /** メモ・エラー等の補足 */
  note?: string
}

/** Timeline: タイムライン画面でのカード表示フィルタ */
export type TimelineFilter = {
  /** 表示するカードIDの配列。null = 全表示（初期状態） */
  visibleCardIds: string[] | null
}

const DEFAULT_BILLING_GROUPS: BillingGroup[] = []

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: '食費', budget: 40000, color: '#1A6B4A' },
  { id: 'transport', name: '交通費', budget: 15000, color: '#2980B9' },
  { id: 'daily', name: '日用品', budget: 10000, color: '#8E44AD' },
  { id: 'entertainment', name: '娯楽・交際', budget: 20000, color: '#E5972A' },
  { id: 'clothing', name: '被服', budget: 10000, color: '#E74C3C' },
  { id: 'other', name: 'その他', budget: 15000, color: '#7F8C8D' },
]

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function lastDayOfMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

/**
 * Sprint1 マイグレーション:
 * - billingMonth (YYYY-MM) を billingPeriod ({ start, end }) に変換
 * - 既存データに billingPeriod が無く billingMonth がある場合のみ補完
 * - 1度だけ実行（フラグ管理）
 *
 * Returns: { migrated: number, hasBulkRecords: boolean }
 */
export function runMigrationV03(): { migrated: number; hasBulkRecords: boolean } {
  const done = load<string>(KEYS.migrationV03, '')
  if (done === '1') {
    const txs = load<Transaction[]>(KEYS.transactions, [])
    const hasBulkRecords = txs.some((t) => t.kind === 'bulk')
    return { migrated: 0, hasBulkRecords }
  }
  const txs = load<Transaction[]>(KEYS.transactions, [])
  let migrated = 0
  const next = txs.map((t) => {
    if (!t.billingPeriod && t.billingMonth && /^\d{4}-\d{2}$/.test(t.billingMonth)) {
      const [y, m] = t.billingMonth.split('-').map(Number)
      const last = lastDayOfMonth(y, m - 1)
      migrated += 1
      return {
        ...t,
        billingPeriod: {
          start: `${t.billingMonth}-01`,
          end: `${t.billingMonth}-${String(last).padStart(2, '0')}`,
        },
      }
    }
    return t
  })
  if (migrated > 0) save(KEYS.transactions, next)
  save(KEYS.migrationV03, '1')
  const hasBulkRecords = next.some((t) => t.kind === 'bulk')
  return { migrated, hasBulkRecords }
}

/**
 * v0.4.8 マイグレーション:
 * v0.4.5以前に作成された bulk レコードは actualWithdrawalDate を持たないため、
 * computeDerivedDates が billingMonth から理論計算してしまい、
 * 引落日と請求期間が誤った値（次サイクル）になる。
 *
 * このマイグレーションは、そうした「壊れたbulk」を検出し、
 * date フィールド（保存時に引落日を入れている）を actualWithdrawalDate にコピーして補修する。
 *
 * Returns: 修復されたレコード数
 */
export function runMigrationV048(): number {
  const done = load<string>(KEYS.migrationV048, '')
  if (done === '1') return 0
  const txs = load<Transaction[]>(KEYS.transactions, [])
  let fixed = 0
  const next = txs.map((t) => {
    if (t.kind === 'bulk' && !t.actualWithdrawalDate && t.date) {
      fixed += 1
      return { ...t, actualWithdrawalDate: t.date }
    }
    return t
  })
  if (fixed > 0) save(KEYS.transactions, next)
  save(KEYS.migrationV048, '1')
  return fixed
}

/**
 * v0.4.21 マイグレーション:
 * 旧apollostation（出光クレジット 10締め/翌月7日引落）グループは
 * 実は旧シェルカードでニコス系列（5締め/当月27日引落）。
 * - name='apollostation'
 * - closingDay=10 かつ withdrawalDay=7 のもの（ユーザーが手動編集していない場合）
 * を検出して自動補正。
 */
export function runMigrationV0421(): number {
  const done = load<string>(KEYS.migrationV0421, '')
  if (done === '1') return 0
  const groups = load<BillingGroup[]>(KEYS.billingGroups, [])
  let fixed = 0
  const next = groups.map((g) => {
    if (
      g.name === 'apollostation' &&
      g.closingDay === 10 &&
      g.withdrawalDay === 7
    ) {
      fixed += 1
      return {
        ...g,
        name: 'ニコス（旧シェル）',
        closingDay: 5 as const,
        withdrawalDay: 27 as const,
        withdrawalMonthOffset: 0,
      }
    }
    return g
  })
  if (fixed > 0) save(KEYS.billingGroups, next)
  save(KEYS.migrationV0421, '1')
  return fixed
}

export const storage = {
  getCategories: () => load<Category[]>(KEYS.categories, DEFAULT_CATEGORIES),
  saveCategories: (v: Category[]) => save(KEYS.categories, v),

  getTransactions: () => load<Transaction[]>(KEYS.transactions, []),
  saveTransactions: (v: Transaction[]) => save(KEYS.transactions, v),

  getFixedCosts: () => load<FixedCost[]>(KEYS.fixedCosts, []),
  saveFixedCosts: (v: FixedCost[]) => save(KEYS.fixedCosts, v),

  getSettings: () =>
    load<Settings>(KEYS.settings, {
      anthropicApiKey: '',
      darkMode: false,
      monthlyIncome: 0,
      payDay: 15,
      payDayShiftRule: 'before',
    }),
  saveSettings: (v: Settings) => save(KEYS.settings, v),

  getLastFixedApplied: () => load<string>(KEYS.lastFixedApplied, ''),
  saveLastFixedApplied: (v: string) => save(KEYS.lastFixedApplied, v),

  getBillingGroups: () =>
    load<BillingGroup[]>(KEYS.billingGroups, DEFAULT_BILLING_GROUPS),
  saveBillingGroups: (v: BillingGroup[]) => save(KEYS.billingGroups, v),

  getCards: () => load<Card[]>(KEYS.cards, []),
  saveCards: (v: Card[]) => save(KEYS.cards, v),

  getWarnedMixedDates: () => load<string>(KEYS.warnedMixedDates, ''),
  saveWarnedMixedDates: (v: string) => save(KEYS.warnedMixedDates, v),

  getTimelineFilter: () =>
    load<TimelineFilter>(KEYS.timelineFilter, { visibleCardIds: null }),
  saveTimelineFilter: (v: TimelineFilter) => save(KEYS.timelineFilter, v),

  // v0.4.33: 銀行残高スナップショット
  getBankSnapshots: () => load<BankSnapshot[]>(KEYS.bankSnapshots, []),
  saveBankSnapshots: (v: BankSnapshot[]) => save(KEYS.bankSnapshots, v),
  upsertBankSnapshot: (s: BankSnapshot) => {
    const list = load<BankSnapshot[]>(KEYS.bankSnapshots, [])
    // 同じ source + date のスナップショットは上書き（複数回CSV取込しても重複しない）
    const filtered = list.filter(
      (x) => !(x.source === s.source && x.date === s.date),
    )
    filtered.push(s)
    filtered.sort((a, b) => a.date.localeCompare(b.date))
    save(KEYS.bankSnapshots, filtered)
  },

  getImportLog: () => load<ImportLogEntry[]>(KEYS.importLog, []),
  appendImportLog: (entry: ImportLogEntry) => {
    const list = load<ImportLogEntry[]>(KEYS.importLog, [])
    list.unshift(entry)
    // 直近100件まで保持
    save(KEYS.importLog, list.slice(0, 100))
  },
  clearImportLog: () => save(KEYS.importLog, []),
}
