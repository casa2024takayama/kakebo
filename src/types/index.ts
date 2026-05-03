export type Category = {
  id: string
  name: string
  budget: number
  color: string
}

export type Transaction = {
  id: string
  amount: number
  categoryId: string
  memo: string
  date: string
  source: 'manual' | 'csv' | 'receipt'
  /** Phase 1: 任意フィールド。未指定は現金/カード未割当扱い */
  cardId?: string
}

export type FixedCost = {
  id: string
  name: string
  amount: number
  categoryId: string
  day: number
}

export type Settings = {
  anthropicApiKey: string
  darkMode: boolean
  /** Phase 1: 月収（手取り、円、整数）。未設定は0 */
  monthlyIncome?: number
}

export type MonthKey = string // "2026-04"

// ===== Phase 1: 請求グループ・カード =====

/** 締め日・引落日。1〜31 または末日('last') */
export type DaySpec = number | 'last'

/** 請求グループ（PayPay / セゾン / イオン / JCB） */
export type BillingGroup = {
  id: string
  name: string
  closingDay: DaySpec
  withdrawalDay: DaySpec
  /** 引落口座の表示用ラベル（任意） */
  withdrawalAccount?: string
}

/** カード（請求グループに所属） */
export type Card = {
  id: string
  name: string
  billingGroupId: string
  color?: string
}

/** 請求サイクル：あるグループの「締め期間」と「引落予定日・予定額」 */
export type BillingCycle = {
  groupId: string
  /** 締め期間開始（YYYY-MM-DD, JST） */
  cycleStart: string
  /** 締め期間終了（YYYY-MM-DD, JST, inclusive） */
  cycleEnd: string
  /** 引落予定日（土日繰延後・YYYY-MM-DD, JST） */
  withdrawalDate: string
  /** 予定引落額（円・整数） */
  total: number
}

/** ダッシュボード用：次回引落予定 */
export type WithdrawalForecast = {
  group: BillingGroup
  cycle: BillingCycle
}

/** 当月収支サマリ */
export type MonthlyDeficit = {
  totalOut: number
  income: number
  balance: number
  status: 'green' | 'yellow' | 'red'
}
