import { describe, expect, it } from 'vitest'
import {
  monthlyForecastPoints,
  overviewAttentionItems,
  overviewSpendingCategories,
  significantAccounts,
} from './overview'

const account = (
  id: string,
  convertedBalanceMinor: string | null,
  archivedAt: string | null = null,
) => ({ id, convertedBalanceMinor, archivedAt })

describe('significantAccounts', () => {
  it('returns at most three active accounts by absolute converted value', () => {
    expect(
      significantAccounts([
        account('small', '1000'),
        account('large-negative', '-90000'),
        account('largest', '120000'),
        account('medium', '50000'),
        account('archived', '999999', '2026-08-01T00:00:00.000Z'),
      ]).map(({ id }) => id),
    ).toEqual(['largest', 'large-negative', 'medium'])
  })

  it('keeps known values when another account has no conversion', () => {
    expect(
      significantAccounts([
        account('unknown', null),
        account('known', '-25000'),
      ]).map(({ id }) => id),
    ).toEqual(['known'])
  })
})

describe('overviewSpendingCategories', () => {
  it('ranks the five largest categories and groups the remainder as Other', () => {
    expect(
      overviewSpendingCategories([
        { categoryId: 'travel', categoryName: 'Travel', amountMinor: '5000' },
        { categoryId: 'food', categoryName: 'Food', amountMinor: '9000' },
        { categoryId: 'bills', categoryName: 'Bills', amountMinor: '8000' },
        { categoryId: 'health', categoryName: 'Health', amountMinor: '4000' },
        { categoryId: 'home', categoryName: 'Home', amountMinor: '7000' },
        { categoryId: 'fun', categoryName: 'Fun', amountMinor: '3000' },
        { categoryId: 'gifts', categoryName: 'Gifts', amountMinor: '2000' },
      ]),
    ).toEqual([
      { categoryId: 'food', categoryName: 'Food', amountMinor: '9000' },
      { categoryId: 'bills', categoryName: 'Bills', amountMinor: '8000' },
      { categoryId: 'home', categoryName: 'Home', amountMinor: '7000' },
      { categoryId: 'travel', categoryName: 'Travel', amountMinor: '5000' },
      { categoryId: 'health', categoryName: 'Health', amountMinor: '4000' },
      { categoryId: null, categoryName: 'Other', amountMinor: '5000' },
    ])
  })

  it('does not add Other when five or fewer categories exist', () => {
    expect(
      overviewSpendingCategories([
        { categoryId: 'food', categoryName: 'Food', amountMinor: '9000' },
      ]),
    ).toEqual([
      { categoryId: 'food', categoryName: 'Food', amountMinor: '9000' },
    ])
  })
})

describe('overviewAttentionItems', () => {
  it('orders objective issues by financial urgency', () => {
    expect(
      overviewAttentionItems({
        expectedLowestMinor: '-2500',
        tentativeLowestMinor: '-5000',
        overdueCount: 2,
        missingRate: true,
        uncategorizedCount: 4,
        staleRate: true,
      }),
    ).toEqual([
      { kind: 'shortfall', scenario: 'expected', balanceMinor: '-2500' },
      { kind: 'overdue', count: 2 },
      { kind: 'missing-rate' },
      { kind: 'uncategorized', count: 4 },
      { kind: 'stale-rate' },
    ])
  })

  it('uses tentative wording only when the expected scenario stays non-negative', () => {
    expect(
      overviewAttentionItems({
        expectedLowestMinor: '1000',
        tentativeLowestMinor: '-500',
        overdueCount: 0,
        missingRate: false,
        uncategorizedCount: 0,
        staleRate: false,
      }),
    ).toEqual([
      { kind: 'shortfall', scenario: 'tentative', balanceMinor: '-500' },
    ])
  })

  it('returns no issues when no user action is needed', () => {
    expect(
      overviewAttentionItems({
        expectedLowestMinor: '0',
        tentativeLowestMinor: '0',
        overdueCount: 0,
        missingRate: false,
        uncategorizedCount: 0,
        staleRate: false,
      }),
    ).toEqual([])
  })
})

describe('monthlyForecastPoints', () => {
  it('shows the last expected balance in each month of the 12-month outlook', () => {
    const points = monthlyForecastPoints('100000', '2026-08-27', [
      { date: '2026-09-01', projectedBalanceMinor: '70000' },
      { date: '2026-09-20', projectedBalanceMinor: '90000' },
      { date: '2026-11-01', projectedBalanceMinor: '-10000' },
    ])

    expect(points).toHaveLength(13)
    expect(points.slice(0, 5)).toEqual([
      { date: '2026-08-27', projectedBalanceMinor: '100000' },
      { date: '2026-09-27', projectedBalanceMinor: '90000' },
      { date: '2026-10-27', projectedBalanceMinor: '90000' },
      { date: '2026-11-27', projectedBalanceMinor: '-10000' },
      { date: '2026-12-27', projectedBalanceMinor: '-10000' },
    ])
    expect(points.at(-1)?.date).toBe('2027-08-27')
  })

  it('preserves a tentative scenario independently from expected values', () => {
    expect(
      monthlyForecastPoints('100000', '2026-08-31', [
        { date: '2026-09-15', projectedBalanceMinor: '20000' },
      ]).slice(0, 3),
    ).toEqual([
      { date: '2026-08-31', projectedBalanceMinor: '100000' },
      { date: '2026-09-30', projectedBalanceMinor: '20000' },
      { date: '2026-10-31', projectedBalanceMinor: '20000' },
    ])
  })
})
