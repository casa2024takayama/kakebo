import { describe, expect, it } from 'vitest'
import { getAllWithdrawalsInRange } from '../src/lib/withdrawalDate'
import type { BillingGroup, Card, Transaction } from '../src/types'

const aeonGroup: BillingGroup = {
  id: 'bg_aeon',
  name: 'イオン',
  closingDay: 10,
  withdrawalDay: 2,
  withdrawalMonthOffset: 1,
}

const cards: Card[] = [
  {
    id: 'card_aeon',
    name: 'イオンカード',
    billingGroupId: 'bg_aeon',
  },
]

function tx(partial: Omit<Transaction, 'id'> & { id?: string }): Transaction {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    ...partial,
  }
}

describe('getAllWithdrawalsInRange', () => {
  it('dedups covered individual rows when bulk coverage exists', () => {
    const transactions: Transaction[] = [
      tx({
        id: 'ind-1',
        amount: 530,
        categoryId: 'transport',
        memo: '駅',
        date: '2026-05-02',
        source: 'csv',
        cardId: 'card_aeon',
        kind: 'individual',
      }),
      tx({
        id: 'ind-2',
        amount: 1426,
        categoryId: 'transport',
        memo: '駅',
        date: '2026-04-29',
        source: 'csv',
        cardId: 'card_aeon',
        kind: 'individual',
      }),
      // 壊れたbulk（actualWithdrawalDateがズレている）
      tx({
        id: 'bulk-broken',
        amount: 1956,
        categoryId: 'other',
        memo: 'イオン請求一括',
        date: '2026-07-02',
        source: 'csv',
        cardId: 'card_aeon',
        kind: 'bulk',
        billingPeriod: { start: '2026-04-11', end: '2026-05-10' },
        actualWithdrawalDate: '2026-07-02',
      }),
    ]

    const list = getAllWithdrawalsInRange(
      transactions,
      cards,
      [aeonGroup],
      new Date('2026-05-01'),
      new Date('2026-07-31'),
    )

    expect(list).toHaveLength(1)
    expect(list[0].total).toBe(1956)
    expect(list[0].transactions.map((t) => t.id)).toEqual(['bulk-broken'])
  })

  it('ignores income and excludeFromWithdrawal rows', () => {
    const transactions: Transaction[] = [
      tx({
        id: 'income-1',
        amount: 320000,
        categoryId: '',
        memo: '給与',
        date: '2026-05-25',
        source: 'manual',
        kind: 'income',
      }),
      tx({
        id: 'ind-excluded',
        amount: 980,
        categoryId: 'food',
        memo: 'コンビニ',
        date: '2026-05-11',
        source: 'manual',
        kind: 'individual',
        excludeFromWithdrawal: true,
      }),
      tx({
        id: 'cash-1',
        amount: 2380,
        categoryId: 'daily',
        memo: '日用品',
        date: '2026-05-14',
        source: 'manual',
        kind: 'individual',
      }),
    ]

    const list = getAllWithdrawalsInRange(
      transactions,
      cards,
      [aeonGroup],
      new Date('2026-05-01'),
      new Date('2026-05-31'),
    )

    expect(list).toHaveLength(1)
    expect(list[0].total).toBe(2380)
    expect(list[0].transactions[0].id).toBe('cash-1')
  })
})
