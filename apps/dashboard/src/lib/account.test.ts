import { describe, expect, it } from 'vitest'
import { accountTypeLabel, formatAccountBalance } from './account'

const account = {
  type: 'credit_card' as const,
  currency: 'USD',
  balanceMinor: '-12500',
}

describe('credit-card account display', () => {
  it('shows debt and card credit without signed money', () => {
    expect(accountTypeLabel(account.type)).toBe('Credit card')
    expect(formatAccountBalance(account)).toBe('Owed 125,00 USD')
    expect(formatAccountBalance({ ...account, balanceMinor: '2500' })).toBe(
      'Card credit 25,00 USD',
    )
  })
})
