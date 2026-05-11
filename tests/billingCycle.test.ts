import { describe, expect, it } from 'vitest'
import { getCycleByWithdrawalDate, getCycleForTransaction } from '../src/lib/billingCycle'
import type { BillingGroup } from '../src/types'

const saisonGroup: BillingGroup = {
  id: 'bg_saison',
  name: 'セゾン',
  closingDay: 10,
  withdrawalDay: 4,
  withdrawalMonthOffset: 1,
}

describe('billingCycle', () => {
  it('calculates cycle and withdrawal date from usage date', () => {
    const cycle = getCycleForTransaction('2026-04-29', saisonGroup)
    expect(cycle).toEqual({
      cycleStart: '2026-04-11',
      cycleEnd: '2026-05-10',
      withdrawalDate: '2026-06-04',
    })
  })

  it('back-calculates cycle from actual withdrawal date', () => {
    const cycle = getCycleByWithdrawalDate('2026-05-07', saisonGroup)
    expect(cycle).toEqual({
      cycleStart: '2026-03-11',
      cycleEnd: '2026-04-10',
      withdrawalDate: '2026-05-07',
    })
  })
})
