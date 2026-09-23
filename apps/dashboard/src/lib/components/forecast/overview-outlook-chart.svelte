<script lang="ts">
  import type { WorkspaceForecast } from '$lib/controllers/workspace-controller.svelte'
  import { todayInWarsaw } from '$lib/date'
  import { formatMoney } from '$lib/money'
  import { monthlyForecastPoints } from '$lib/overview'

  let { expected }: { expected: WorkspaceForecast } = $props()

  type ChartPoint = { date: string; projectedBalanceMinor: string }

  const width = 1000
  const height = 220
  const inset = 16
  const startDate = todayInWarsaw()
  const startTime = Date.parse(`${startDate}T12:00:00Z`)
  let currency = $derived(expected.reportingCurrency!)
  let expectedSeries = $derived<ChartPoint[]>(
    monthlyForecastPoints(
      expected.startingBalanceMinor!,
      startDate,
      expected.points,
    ),
  )
  let endTime = $derived(Date.parse(`${expectedSeries.at(-1)!.date}T12:00:00Z`))
  let months = $derived(
    expectedSeries.map(({ date }) => ({
      date,
      label: new Intl.DateTimeFormat('en', { month: 'short' }).format(
        new Date(`${date}T12:00:00Z`),
      ),
    })),
  )
  let balanceRange = $derived.by(() => {
    const values = expectedSeries.map(({ projectedBalanceMinor }) =>
      BigInt(projectedBalanceMinor),
    )
    return {
      minimum: values.reduce((value, item) => (item < value ? item : value)),
      maximum: values.reduce((value, item) => (item > value ? item : value)),
    }
  })
  function x(date: string) {
    return (
      inset +
      ((Date.parse(`${date}T12:00:00Z`) - startTime) / (endTime - startTime)) *
        (width - inset * 2)
    )
  }

  function y(balanceMinor: string) {
    const { minimum, maximum } = balanceRange
    if (minimum === maximum) return height / 2
    const ratio =
      Number(BigInt(balanceMinor) - minimum) / Number(maximum - minimum)
    return height - inset - ratio * (height - inset * 2)
  }

  function linePath(points: ChartPoint[]) {
    return points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${x(point.date)} ${y(point.projectedBalanceMinor)}`,
      )
      .join(' ')
  }

  function areaPath(points: ChartPoint[]) {
    const first = points[0]!
    const last = points.at(-1)!
    return `${linePath(points)} L ${x(last.date)} ${height - inset} L ${x(first.date)} ${height - inset} Z`
  }
</script>

<!-- Horizontal chart overflow must be keyboard-scrollable. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  role="region"
  aria-label="Expected monthly balance chart"
  tabindex="0"
>
  <div class="relative h-64 min-w-[42rem] border bg-muted/20">
    <svg
      class="size-full pb-6"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby="overview-outlook-chart-title overview-outlook-chart-description"
      preserveAspectRatio="none"
    >
      <title id="overview-outlook-chart-title">
        Expected balance: 12-month projection
      </title>
      <desc id="overview-outlook-chart-description">
        Monthly expected balance from the current balance and expected plans.
        Planned activity can change and projected values are not guaranteed.
      </desc>
      <path d={areaPath(expectedSeries)} class="fill-primary/10" />
      <path
        d={linePath(expectedSeries)}
        class="fill-none stroke-primary"
        stroke-width="3"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span
      class="absolute bottom-7 left-4 bg-background/90 px-1 text-xs font-medium tabular-nums"
    >
      Now · {formatMoney(expectedSeries[0]!.projectedBalanceMinor, currency)}
    </span>
    <span
      class="absolute top-2 right-4 bg-background/90 px-1 text-xs font-medium tabular-nums"
    >
      12 months · {formatMoney(
        expectedSeries.at(-1)!.projectedBalanceMinor,
        currency,
      )}
    </span>
    <div
      class="absolute inset-x-4 bottom-1 grid grid-cols-[repeat(13,minmax(0,1fr))] text-center text-[0.625rem] text-muted-foreground"
      aria-hidden="true"
    >
      {#each months as month (month.date)}<span>{month.label}</span>{/each}
    </div>
  </div>
</div>
