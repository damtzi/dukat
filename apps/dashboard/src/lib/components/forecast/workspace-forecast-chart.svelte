<script lang="ts">
  import { resolve } from '$app/paths'
  import type { Account } from '@dukat/core/ledger'
  import { Button, Card, Table } from '@dukat/ui'
  import type { Plan } from '$lib/components/planning/planning-types'
  import type {
    WorkspaceForecast,
    WorkspaceForecastOccurrence,
  } from '$lib/controllers/workspace-controller.svelte'
  import { todayInWarsaw } from '$lib/date'
  import { formatMoney } from '$lib/money'

  let {
    expected,
    tentative,
    plans,
    accounts,
    workspaceId,
  }: {
    expected: WorkspaceForecast
    tentative: WorkspaceForecast
    plans: Plan[]
    accounts: Account[]
    workspaceId: string
  } = $props()

  type ChartPoint = {
    date: string
    projectedBalanceMinor: string
  }

  const width = 1000
  const height = 240
  const inset = 18
  const startDate = todayInWarsaw()
  const startTime = Date.parse(`${startDate}T12:00:00Z`)
  const start = new Date(startTime)
  const endTime = Date.UTC(
    start.getUTCFullYear() + 1,
    start.getUTCMonth(),
    start.getUTCDate(),
    12,
  )
  const endDate = new Date(endTime).toISOString().slice(0, 10)
  let currency = $derived(expected.reportingCurrency!)
  let expectedSeries = $derived<ChartPoint[]>([
    {
      date: startDate,
      projectedBalanceMinor: expected.startingBalanceMinor!,
    },
    ...expected.points,
    {
      date: endDate,
      projectedBalanceMinor: expected.endingBalanceMinor!,
    },
  ])
  let tentativeSeries = $derived<ChartPoint[]>([
    {
      date: startDate,
      projectedBalanceMinor: tentative.startingBalanceMinor!,
    },
    ...tentative.points,
    {
      date: endDate,
      projectedBalanceMinor: tentative.endingBalanceMinor!,
    },
  ])
  let balanceRange = $derived.by(() => {
    const values = [...expectedSeries, ...tentativeSeries].map((point) =>
      BigInt(point.projectedBalanceMinor),
    )
    const minimum = values.reduce(
      (value, item) => (item < value ? item : value),
      values[0]!,
    )
    const maximum = values.reduce(
      (value, item) => (item > value ? item : value),
      values[0]!,
    )
    return { minimum, maximum }
  })
  let occurrencePoints = $derived([
    ...expected.points.map((point) => ({
      ...point,
      scenario: 'Expected' as const,
    })),
    ...tentative.points
      .filter((point) => point.status === 'tentative')
      .map((point) => ({ ...point, scenario: 'Tentative' as const })),
  ])

  function x(date: string) {
    const time = Date.parse(`${date}T12:00:00Z`)
    return (
      inset + ((time - startTime) / (endTime - startTime)) * (width - inset * 2)
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

  function area(points: ChartPoint[]) {
    const last = points.at(-1)!
    const first = points[0]!
    return `${stepLine(points)} L ${x(last.date)} ${height - inset} L ${x(first.date)} ${height - inset} Z`
  }

  const planFor = (planId: string) => plans.find((plan) => plan.id === planId)
  const accountFor = (accountId: string) =>
    accounts.find((account) => account.id === accountId)
  const labelFor = (item: WorkspaceForecastOccurrence) =>
    planFor(item.planId)?.description ||
    `Planned ${item.kind === 'income' ? 'income' : 'expense'}`
</script>

<Card.Root>
  <Card.Header>
    <Card.Title id="workspace-forecast-chart-title">
      Expected and tentative outlook
    </Card.Title>
    <Card.Description>
      Expected uses unmatched expected plans. Tentative shows the possible
      balance when tentative plans are also included. Focus an occurrence to
      inspect it or open account planning.
    </Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-5">
    <div class="flex flex-wrap gap-5 text-sm" aria-hidden="true">
      <span class="flex items-center gap-2">
        <span class="h-0.5 w-8 bg-primary"></span>
        Expected
      </span>
      <span class="flex items-center gap-2">
        <span class="w-8 border-t-2 border-dotted border-primary/60"></span>
        Tentative
      </span>
    </div>

    <div
      class="relative h-60 overflow-hidden border bg-muted/20"
      role="group"
      aria-labelledby="workspace-forecast-chart-title"
    >
      <svg
        class="size-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="forecast-svg-title forecast-svg-description"
        preserveAspectRatio="none"
      >
        <title id="forecast-svg-title">12-month projected balance</title>
        <desc id="forecast-svg-description">
          Solid Expected balance and dotted Tentative balance, with one point
          for each planned occurrence.
        </desc>
        <path d={area(expectedSeries)} class="fill-primary/10" />
        <path
          d={stepLine(expectedSeries)}
          class="fill-none stroke-primary"
          stroke-width="3"
          vector-effect="non-scaling-stroke"
        />
        <path
          d={stepLine(tentativeSeries)}
          class="fill-none stroke-primary/60"
          stroke-width="2"
          stroke-dasharray="4 6"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      {#each occurrencePoints as point (`${point.scenario}:${point.planId}:${point.originalDate}`)}
        {@const account = accountFor(point.accountId)}
        <a
          class={[
            'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            point.scenario === 'Tentative'
              ? 'border-primary bg-background'
              : 'border-background bg-primary',
          ]}
          style:left={`${(x(point.date) / width) * 100}%`}
          style:top={`${(y(point.projectedBalanceMinor) / height) * 100}%`}
          href={resolve(
            '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
            { workspaceId, accountId: point.accountId },
          )}
          aria-label={`${labelFor(point)}, ${point.scenario}, ${account?.name ?? 'Account'}, ${point.date}, projected balance ${formatMoney(point.projectedBalanceMinor, currency)}`}
          title={`${point.date} · ${labelFor(point)} · ${formatMoney(point.projectedBalanceMinor, currency)}`}
        ></a>
      {/each}
    </div>

    <div class="hidden overflow-x-auto sm:block">
      <Table.Root aria-label="Forecast occurrences">
        <Table.Caption>
          Every unmatched planned occurrence in the 12-month forecast.
        </Table.Caption>
        <Table.Header>
          <Table.Row>
            <Table.Head>Date</Table.Head>
            <Table.Head>Scenario</Table.Head>
            <Table.Head>Plan</Table.Head>
            <Table.Head>Account</Table.Head>
            <Table.Head>Original amount</Table.Head>
            <Table.Head>Projected balance</Table.Head>
            <Table.Head><span class="sr-only">Manage</span></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each tentative.points as point (`${point.planId}:${point.originalDate}`)}
            {@const account = accountFor(point.accountId)}
            <Table.Row>
              <Table.Cell>{point.date}</Table.Cell>
              <Table.Cell
                >{point.status === 'expected'
                  ? 'Expected'
                  : 'Tentative'}</Table.Cell
              >
              <Table.Cell>{labelFor(point)}</Table.Cell>
              <Table.Cell>{account?.name ?? 'Unavailable account'}</Table.Cell>
              <Table.Cell>
                {formatMoney(point.sourceAmountMinor, point.sourceCurrency)}
              </Table.Cell>
              <Table.Cell>
                {formatMoney(point.projectedBalanceMinor, currency)}
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="link"
                  href={resolve(
                    '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
                    { workspaceId, accountId: point.accountId },
                  )}
                  aria-label={`Manage ${account?.name ?? 'account'} plans`}
                  >Manage plans</Button
                >
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>

    <div
      class="flex flex-col gap-3 sm:hidden"
      role="list"
      aria-label="Forecast occurrences"
    >
      {#each tentative.points as point (`mobile:${point.planId}:${point.originalDate}`)}
        {@const account = accountFor(point.accountId)}
        <article class="inset-panel flex flex-col gap-2" role="listitem">
          <div class="flex items-start justify-between gap-3">
            <div>
              <strong>{labelFor(point)}</strong>
              <p class="text-sm text-muted-foreground">
                {point.date} · {point.status === 'expected'
                  ? 'Expected'
                  : 'Tentative'}
              </p>
            </div>
            <strong>{formatMoney(point.projectedBalanceMinor, currency)}</strong
            >
          </div>
          <p class="text-sm">
            {account?.name ?? 'Unavailable account'} · Original amount
            {formatMoney(point.sourceAmountMinor, point.sourceCurrency)}
          </p>
          <Button
            variant="outline"
            href={resolve(
              '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
              { workspaceId, accountId: point.accountId },
            )}
            aria-label={`Manage ${account?.name ?? 'account'} plans`}
            >Manage plans</Button
          >
        </article>
      {/each}
      <p class="text-sm text-muted-foreground">
        Every unmatched planned occurrence in the 12-month forecast.
      </p>
    </div>
  </Card.Content>
</Card.Root>
