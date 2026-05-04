import type {
  Category,
  Transaction,
  FixedCost,
  Settings,
  BillingGroup,
  Card,
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
}
