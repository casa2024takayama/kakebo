export type Category = {
  id: string
  name: string
  budget: number
  color: string
}

/** 日付範囲 (YYYY-MM-DD JST, inclusive) */
export type DateRange = {
  start: string
  end: string
}

export type Transaction = {
  id: string
  amount: number
  categoryId: string
  memo: string
  /**
   * 利用日（YYYY-MM-DD, JST）。
   * IMPORTANT: これは「利用日」固定であり、引落日や請求日に書き換えてはならない。
   * 引落日は派生データなので Transaction には保存せず、表示時に都度計算する。
   */
  date: string
  source: 'manual' | 'csv' | 'receipt'
  /** Phase 1: 任意フィールド。未指定は現金/カード未割当扱い */
  cardId?: string
  /**
   * 取引種別:
   * - 'individual': 個別取引（既定）
   * - 'bulk': 請求一括
   * - 'income': 収入（給料等、月変動）— v0.4.27 追加
   * 未指定は 'individual' とみなす
   */
  kind?: 'individual' | 'bulk' | 'income'
  /**
   * Sprint1: 請求一括の請求期間（締め期間）。
   * 例: { start: '2026-04-15', end: '2026-05-14' }
   */
  billingPeriod?: DateRange
  /**
   * @deprecated Sprint1 で billingPeriod に置き換え。
   * 既存データ互換のために残してあるが、新規書き込みには使わない。
   * ('YYYY-MM' 形式)
   */
  billingMonth?: string
  /** Phase 1.5: 引落計算から除外（記録のみ）。請求一括との重複制御に使用 */
  excludeFromWithdrawal?: boolean
  /**
   * v0.4.3: 実際の引落日（YYYY-MM-DD）。
   * カード会社のCSV取込時、CSVのメタデータに記載された支払日を全明細に自動付与。
   * 値があれば理論計算より優先される（請求遅延などで実引落が理論サイクルとずれた場合に対応）。
   */
  actualWithdrawalDate?: string
}

export type FixedCost = {
  id: string
  name: string
  amount: number
  categoryId: string
  day: number
}

export type PayDayShiftRule = 'before' | 'after' | 'none'

export type Settings = {
  anthropicApiKey: string
  darkMode: boolean
  /** Phase 1: 月収（手取り、円、整数）。未設定は0 */
  monthlyIncome?: number
  /** Sprint1: 給料日（1〜31 or 'last'）。既定 15 */
  payDay?: number | 'last'
  /**
   * Sprint1: 給料日が休業日のときのシフトルール。
   * - 'before': 前営業日繰上（既定）
   * - 'after' : 翌営業日繰下
   * - 'none'  : シフトしない
   */
  payDayShiftRule?: PayDayShiftRule
  /**
   * v0.4.4: テストモード。
   * ON時、ページロード毎に取引・固定費を自動削除する（クリーン状態でテスト用）。
   * 既定 false。個人利用前提のため設定UIに表面化している。
   */
  testMode?: boolean
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
  /**
   * v0.4.21: 引落月のオフセット（締め月から何ヶ月後に引き落とすか）。
   * 多くは 1（翌月）。シェル/ニコス系の一部カードは 0（当月）。
   * 未設定なら 1 とみなす（既存データ互換）。
   */
  withdrawalMonthOffset?: number
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
