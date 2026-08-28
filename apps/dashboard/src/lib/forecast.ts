type ForecastBalances = {
  startingBalanceMinor: string | null
  points: readonly { projectedBalanceMinor: string }[]
}

export function lowestProjectedBalance(forecast: ForecastBalances) {
  if (forecast.startingBalanceMinor === null) return null
  return forecast.points.reduce(
    (lowest, point) =>
      BigInt(point.projectedBalanceMinor) < BigInt(lowest)
        ? point.projectedBalanceMinor
        : lowest,
    forecast.startingBalanceMinor,
  )
}
