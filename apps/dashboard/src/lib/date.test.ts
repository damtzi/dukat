import { describe, expect, it } from 'vitest'
import { calendarMonthRange, shiftCalendarMonth, todayInWarsaw } from './date'

describe('Warsaw calendar helpers', () => {
  it('uses Warsaw rather than UTC at the day boundary', () => {
    expect(todayInWarsaw(new Date('2026-03-31T22:30:00Z'))).toBe('2026-04-01')
  })
  it('handles leap years and month shifts', () => {
    expect(calendarMonthRange('2024-02-10')).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    })
    expect(shiftCalendarMonth('2026-01-15', -1)).toEqual({
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    })
  })
})
