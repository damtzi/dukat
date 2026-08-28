import { describe, expect, it } from 'vitest'
import { lowestProjectedBalance } from './forecast'

describe('lowestProjectedBalance', () => {
  it('retains an occurrence-level shortfall even when the ending balance recovers', () => {
    expect(
      lowestProjectedBalance({
        startingBalanceMinor: '50000',
        points: [
          { projectedBalanceMinor: '-30000' },
          { projectedBalanceMinor: '100000' },
        ],
      }),
    ).toBe('-30000')
  })

  it('uses the current balance when there are no lower occurrences', () => {
    expect(
      lowestProjectedBalance({
        startingBalanceMinor: '50000',
        points: [{ projectedBalanceMinor: '60000' }],
      }),
    ).toBe('50000')
  })

  it('does not derive a balance when combined conversion is unavailable', () => {
    expect(
      lowestProjectedBalance({ startingBalanceMinor: null, points: [] }),
    ).toBeNull()
  })
})
