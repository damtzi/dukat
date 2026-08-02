import { describe, expect, it } from 'vitest'
import { todayInWarsaw } from './date'

describe('todayInWarsaw', () => {
  it('uses the Warsaw calendar date around UTC midnight', () => {
    expect(todayInWarsaw(new Date('2026-07-31T22:30:00Z'))).toBe('2026-08-01')
  })

  it('uses the previous Warsaw date before local midnight', () => {
    expect(todayInWarsaw(new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01')
  })
})
