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
  /** Phase 1.5: 個別取引 or 請求一括（未指定は個別とみなす） */
  kind?: 'individual' | 'bulk'
  /** Phase 1.5: 請求一括の請求月（'YYYY-MM'） */
  billingMonth?: string
  /** Phase 1.5: 引落計算から除外（記録のみ）。請求一括との重複制御に使用 */
  excludeFromWithdrawal?: boolean
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

/** Phase 1.5: カードマスタ（ビルトイン定義） */
export type CardMaster = {
  /** カード/ブランド名 */
  name: string
  /** 発行元 */
  issuer: string
  /** 締め日 */
  closingDay: DaySpec
  /** 引落日 */
  withdrawalDay: DaySpec
  /** 引落月オフセット（締め月から何ヶ月後か。多くは1） */
  withdrawalMonthOffset: number
  /** 補足メモ */
  notes?: string
}

/** Phase 1.5: 引落集中アラート */
export type ConcentrationAlert = {
  /** 引落日（YYYY-MM-DD） */
  date: string
  /** 同日に引き落とされる予定 */
  forecasts: WithdrawalForecast[]
  /** 合計額 */
  total: number
}

/** 当月収支サマリ */
export type MonthlyDeficit = {
  totalOut: number
  income: number
  balance: number
  status: 'green' | 'yellow' | 'red'
}
