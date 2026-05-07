import type { CardMaster } from '../types'

/**
 * Phase 1.5: ビルトインカードマスタ
 * 楽天は「一般」と「楽天市場系」を別レコードとして登録できるよう2件用意。
 * withdrawalMonthOffset は締め月から引落月までの月数（多くは1 = 翌月）。
 */
export const CARD_MASTERS: CardMaster[] = [
  {
    name: 'セゾン',
    issuer: 'クレディセゾン',
    closingDay: 10,
    withdrawalDay: 4,
    withdrawalMonthOffset: 1,
    notes: '翌営業日',
  },
  {
    name: 'AEON',
    issuer: 'イオンFS',
    closingDay: 10,
    withdrawalDay: 2,
    withdrawalMonthOffset: 1,
    notes: '翌営業日',
  },
  {
    name: 'PayPay',
    issuer: 'PayPayカード',
    closingDay: 'last',
    withdrawalDay: 27,
    withdrawalMonthOffset: 1,
    notes: '翌営業日',
  },
  {
    name: 'JCB',
    issuer: 'JCB',
    closingDay: 15,
    withdrawalDay: 10,
    withdrawalMonthOffset: 1,
    notes: '翌営業日',
  },
  {
    name: 'ビューカード',
    issuer: 'JR東日本',
    closingDay: 5,
    withdrawalDay: 4,
    withdrawalMonthOffset: 1,
    notes: 'ビックカメラSuica等',
  },
  {
    name: '楽天Master（一般）',
    issuer: '楽天カード',
    closingDay: 'last',
    withdrawalDay: 27,
    withdrawalMonthOffset: 1,
  },
  {
    name: '楽天Master（楽天市場系）',
    issuer: '楽天カード',
    closingDay: 25,
    withdrawalDay: 27,
    withdrawalMonthOffset: 1,
    notes: '26日以降利用は翌々月扱い',
  },
  {
    name: 'ニコス（旧シェル）',
    issuer: 'ニコス',
    closingDay: 5,
    withdrawalDay: 27,
    withdrawalMonthOffset: 0,
    notes: '当月27日引落（締め月と同月）',
  },
  {
    name: 'J-WEST',
    issuer: 'JR西日本',
    closingDay: 15,
    withdrawalDay: 10,
    withdrawalMonthOffset: 1,
  },
]
