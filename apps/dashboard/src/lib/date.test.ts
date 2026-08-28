import { describe, expect, it } from 'vitest'
import {
  calendarMonthRange,
  cashFlowRange,
  equivalentCashFlowRange,
  formatDateRange,
  shiftCalendarMonth,
  todayInWarsaw,
} from './date'

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

describe('cash-flow periods', () => {
  it('builds month, rolling, and year-to-date ranges', () => {
    expect(cashFlowRange('month', '2026-08-27')).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-27',
    })
    expect(cashFlowRange('12m', '2026-08-27')).toEqual({
      startDate: '2025-09-01',
      endDate: '2026-08-27',
    })
    expect(cashFlowRange('ytd', '2026-08-27')).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-08-27',
    })
  })

  it('builds fair preset and custom comparison periods', () => {
    expect(
      equivalentCashFlowRange(
        { startDate: '2026-08-01', endDate: '2026-08-27' },
        'month',
      ),
    ).toEqual({ startDate: '2026-07-01', endDate: '2026-07-27' })
    expect(
      equivalentCashFlowRange(
        { startDate: '2026-01-01', endDate: '2026-08-27' },
        'ytd',
      ),
    ).toEqual({ startDate: '2025-01-01', endDate: '2025-08-27' })
    expect(
      equivalentCashFlowRange(
        { startDate: '2026-08-10', endDate: '2026-08-20' },
        'custom',
      ),
    ).toEqual({ startDate: '2026-07-30', endDate: '2026-08-09' })
    expect(
      formatDateRange({ startDate: '2026-08-01', endDate: '2026-08-27' }),
    ).toBe('Aug 1, 2026–Aug 27, 2026')
  })
})
