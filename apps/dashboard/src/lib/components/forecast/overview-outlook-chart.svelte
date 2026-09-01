<script lang="ts">
  import { resolve } from '$app/paths'
  import type { Account } from '@dukat/core/ledger'
  import type {
    WorkspaceForecast,
    WorkspaceForecastOccurrence,
  } from '$lib/controllers/workspace-controller.svelte'
  import { todayInWarsaw } from '$lib/date'
  import { formatMoney } from '$lib/money'
  import { monthlyForecastPoints } from '$lib/overview'

  let {
    expected,
    tentative,
    accounts,
    workspaceId,
  }: {
    expected: WorkspaceForecast
    tentative: WorkspaceForecast | null
    accounts: Account[]
    workspaceId: string
  } = $props()

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
  let tentativeSeries = $derived<ChartPoint[]>(
    tentative
      ? monthlyForecastPoints(
          tentative.startingBalanceMinor!,
          startDate,
          tentative.points,
        )
      : [],
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
    const values = [
      ...expectedSeries,
      ...tentativeSeries,
      ...expected.points,
      ...(tentative?.points ?? []),
    ].map(({ projectedBalanceMinor }) => BigInt(projectedBalanceMinor))
    return {
      minimum: values.reduce((value, item) => (item < value ? item : value)),
      maximum: values.reduce((value, item) => (item > value ? item : value)),
    }
  })
  let occurrencePoints = $derived([
    ...expected.points.map((point) => ({ ...point, scenario: 'Expected' })),
    ...(tentative?.points ?? [])
      .filter(({ status }) => status === 'tentative')
      .map((point) => ({ ...point, scenario: 'Tentative' })),
  ])

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

  function stepLine(points: ChartPoint[]) {
    const [first, ...rest] = points
    if (!first) return ''
    let previous = first
    const path = [`M ${x(first.date)} ${y(first.projectedBalanceMinor)}`]
    for (const point of rest) {
      path.push(
        `L ${x(point.date)} ${y(previous.projectedBalanceMinor)}`,
        `L ${x(point.date)} ${y(point.projectedBalanceMinor)}`,
      )
      previous = point
    }
    return path.join(' ')
  }

  const accountFor = (accountId: string) =>
    accounts.find(({ id }) => id === accountId)
  const occurrenceLabel = (point: WorkspaceForecastOccurrence) =>
    `${point.kind === 'income' ? 'Income' : 'Expense'}, ${accountFor(point.accountId)?.name ?? 'account'}, ${point.date}`
</script>

<div
  class="overflow-x-auto"
  role="group"
  aria-labelledby="overview-outlook-chart-title"
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
        Outlook: 12-month projected balance
      </title>
      <desc id="overview-outlook-chart-description">
        Monthly Expected balance{tentative
          ? ' and dotted Tentative balance'
          : ''}. Planned activity can change and projected values are not
        guaranteed.
      </desc>
      <path
        d={stepLine(expectedSeries)}
        class="fill-none stroke-primary"
        stroke-width="3"
        vector-effect="non-scaling-stroke"
      />
      {#if tentative}
        <path
          d={stepLine(tentativeSeries)}
          class="fill-none stroke-primary/60"
          stroke-width="2"
          stroke-dasharray="4 6"
          vector-effect="non-scaling-stroke"
        />
      {/if}
    </svg>
    {#each occurrencePoints as point (`${point.scenario}:${point.planId}:${point.originalDate}`)}
      <a
        class={[
          'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          point.scenario === 'Tentative'
            ? 'border-primary bg-background'
            : 'border-background bg-primary',
        ]}
        style:left={`${(x(point.date) / width) * 100}%`}
        style:top={`${(y(point.projectedBalanceMinor) / height) * 88}%`}
        href={resolve(
          '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
          { workspaceId, accountId: point.accountId },
        )}
        aria-label={`${occurrenceLabel(point)}, ${point.scenario}, projected balance ${formatMoney(point.projectedBalanceMinor, currency)}`}
        title={`${occurrenceLabel(point)} · ${point.scenario}`}
      ></a>
    {/each}
    <div
      class="absolute inset-x-4 bottom-1 grid grid-cols-[repeat(13,minmax(0,1fr))] text-center text-[0.625rem] text-muted-foreground"
      aria-hidden="true"
    >
      {#each months as month (month.date)}<span>{month.label}</span>{/each}
    </div>
  </div>
</div>
