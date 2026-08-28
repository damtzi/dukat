type ConvertedAccount = {
  id: string
  archivedAt: string | null
  convertedBalanceMinor: string | null
}

type ForecastPoint = { date: string; projectedBalanceMinor: string }

type SpendingCategory = {
  categoryId: string | null
  categoryName: string
  amountMinor: string
}

type AttentionInput = {
  expectedLowestMinor: string | null
  tentativeLowestMinor: string | null
  overdueCount: number
  missingRate: boolean
  uncategorizedCount: number
  staleRate: boolean
}

export type OverviewAttentionItem =
  | {
      kind: 'shortfall'
      scenario: 'expected' | 'tentative'
      balanceMinor: string
    }
  | { kind: 'overdue'; count: number }
  | { kind: 'missing-rate' }
  | { kind: 'uncategorized'; count: number }
  | { kind: 'stale-rate' }

export function absoluteMinor(value: string | bigint) {
  const amount = BigInt(value)
  return amount < 0n ? -amount : amount
}

export function significantAccounts<T extends ConvertedAccount>(accounts: T[]) {
  return accounts
    .filter(
      (account) =>
        !account.archivedAt && account.convertedBalanceMinor !== null,
    )
    .sort((left, right) => {
      const leftAbsolute = absoluteMinor(left.convertedBalanceMinor!)
      const rightAbsolute = absoluteMinor(right.convertedBalanceMinor!)
      return leftAbsolute === rightAbsolute
        ? left.id.localeCompare(right.id)
        : leftAbsolute > rightAbsolute
          ? -1
          : 1
    })
    .slice(0, 3)
}

export function overviewSpendingCategories(
  categories: readonly SpendingCategory[],
): SpendingCategory[] {
  const ranked = [...categories].sort((left, right) => {
    const leftAmount = BigInt(left.amountMinor)
    const rightAmount = BigInt(right.amountMinor)
    return leftAmount === rightAmount
      ? left.categoryName.localeCompare(right.categoryName)
      : leftAmount > rightAmount
        ? -1
        : 1
  })
  const remaining = ranked.slice(5)
  if (remaining.length === 0) return ranked

  return [
    ...ranked.slice(0, 5),
    {
      categoryId: null,
      categoryName: 'Other',
      amountMinor: remaining
        .reduce((total, category) => total + BigInt(category.amountMinor), 0n)
        .toString(),
    },
  ]
}

export function overviewAttentionItems({
  expectedLowestMinor,
  tentativeLowestMinor,
  overdueCount,
  missingRate,
  uncategorizedCount,
  staleRate,
}: AttentionInput): OverviewAttentionItem[] {
  const items: OverviewAttentionItem[] = []
  if (expectedLowestMinor !== null && BigInt(expectedLowestMinor) < 0n) {
    items.push({
      kind: 'shortfall',
      scenario: 'expected',
      balanceMinor: expectedLowestMinor,
    })
  } else if (
    tentativeLowestMinor !== null &&
    BigInt(tentativeLowestMinor) < 0n
  ) {
    items.push({
      kind: 'shortfall',
      scenario: 'tentative',
      balanceMinor: tentativeLowestMinor,
    })
  }
  if (overdueCount > 0) items.push({ kind: 'overdue', count: overdueCount })
  if (missingRate) items.push({ kind: 'missing-rate' })
  if (uncategorizedCount > 0)
    items.push({ kind: 'uncategorized', count: uncategorizedCount })
  if (staleRate) items.push({ kind: 'stale-rate' })
  return items
}

export function monthlyForecastPoints(
  startingBalanceMinor: string,
  startDate: string,
  points: readonly ForecastPoint[],
) {
  const [year, month, day] = startDate.split('-').map(Number) as [
    number,
    number,
    number,
  ]

  return Array.from({ length: 13 }, (_, index) => {
    const targetMonth = new Date(Date.UTC(year, month - 1 + index, 1))
    const lastDay = new Date(
      Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0),
    ).getUTCDate()
    const date = new Date(
      Date.UTC(
        targetMonth.getUTCFullYear(),
        targetMonth.getUTCMonth(),
        Math.min(day, lastDay),
      ),
    )
      .toISOString()
      .slice(0, 10)
    const balance = points.filter((point) => point.date <= date).at(-1)
    return {
      date,
      projectedBalanceMinor:
        balance?.projectedBalanceMinor ?? startingBalanceMinor,
    }
  })
}
