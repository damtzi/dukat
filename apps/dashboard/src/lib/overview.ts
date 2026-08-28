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
