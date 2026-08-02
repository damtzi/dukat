import { describe, expect, it } from 'vitest'
import {
  currencyDigits,
  formatMoney,
  minorToDecimal,
  parseAmount,
} from './money'

describe('parseAmount', () => {
  it('uses currency fraction digits exactly', () => {
    expect(parseAmount('12.34', 'USD')).toBe('1234')
    expect(parseAmount('12', 'JPY')).toBe('12')
    expect(currencyDigits('KWD')).toBe(3)
  })
  it('rejects zero, excess precision, and malformed values', () => {
    expect(() => parseAmount('0', 'USD')).toThrow('greater than zero')
    expect(() => parseAmount('1.001', 'USD')).toThrow('at most 2')
    expect(() => parseAmount('1,00', 'USD')).toThrow()
  })
  it('allows negative opening balances when requested', () => {
    expect(parseAmount('-10.50', 'USD', true)).toBe('-1050')
  })
  it('round-trips and formats exact signed int64 values', () => {
    expect(parseAmount('92233720368547758.07', 'USD')).toBe(
      '9223372036854775807',
    )
    expect(parseAmount('-92233720368547758.08', 'USD', true)).toBe(
      '-9223372036854775808',
    )
    expect(() => parseAmount('92233720368547758.08', 'USD')).toThrow(
      'too large',
    )
    expect(minorToDecimal('-1050', 'USD')).toBe('-10.50')
    expect(formatMoney('9007199254740990', 'USD')).not.toBe(
      formatMoney('9007199254740991', 'USD'),
    )
  })
})
