<script lang="ts">
  import type { NetWorthHistoryPoint } from '@dukat/core/overview'
  import { Card, Empty } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let {
    history,
    currency,
  }: { history: NetWorthHistoryPoint[]; currency: string } = $props()

  const width = 1000
  const height = 240
  const inset = 24
  const series = [
    {
      key: 'personalNetWorth',
      label: 'Personal',
      className: 'stroke-chart-1',
      markerClassName: 'bg-chart-1',
      dash: undefined,
    },
    {
      key: 'householdNetWorth',
      label: 'Household',
      className: 'stroke-chart-3',
      markerClassName: 'bg-chart-3',
      dash: '8 6',
    },
    {
      key: 'combinedNetWorth',
      label: 'Combined accessible',
      className: 'stroke-chart-5',
      markerClassName: 'bg-chart-5',
      dash: undefined,
    },
  ] as const
  let availableValues = $derived(
    history.flatMap((point) =>
      series.flatMap(({ key }) => {
        const value = point[key].amountMinor
        return value === null ? [] : [BigInt(value)]
      }),
    ),
  )
  let minimum = $derived(
    availableValues.reduce(
      (smallest, value) => (value < smallest ? value : smallest),
      availableValues[0] ?? 0n,
    ),
  )
  let maximum = $derived(
    availableValues.reduce(
      (largest, value) => (value > largest ? value : largest),
      availableValues[0] ?? 0n,
    ),
  )
  let latest = $derived(history.at(-1))

  function x(index: number) {
    if (history.length < 2) return width / 2
    return inset + (index / (history.length - 1)) * (width - inset * 2)
  }

  function y(value: string) {
    if (minimum === maximum) return height / 2
    const ratio = Number(BigInt(value) - minimum) / Number(maximum - minimum)
    return height - inset - ratio * (height - inset * 2)
  }

  function lines(key: (typeof series)[number]['key']) {
    const paths: string[] = []
    let current: string[] = []
    history.forEach((point, index) => {
      const value = point[key].amountMinor
      if (value === null) {
        if (current.length) paths.push(current.join(' '))
        current = []
      } else {
        current.push(`${current.length ? 'L' : 'M'} ${x(index)} ${y(value)}`)
      }
    })
    if (current.length) paths.push(current.join(' '))
    return paths
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title
      ><h2 id="net-worth-history-title">Net-worth history</h2></Card.Title
    >
    <Card.Description>
      Daily Personal, Household, and combined accessible values. Gaps mean a
      required exchange rate was unavailable.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if history.length > 0}
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-hidden="true">
          {#each series as item (item.key)}
            <span class="flex items-center gap-2">
              <span class={['h-0.5 w-5', item.markerClassName]}></span>
              {item.label}
            </span>
          {/each}
        </div>
        <div class="overflow-x-auto">
          <svg
            class="h-64 min-w-[42rem] w-full"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby="net-worth-history-title net-worth-history-description"
            preserveAspectRatio="none"
          >
            <desc id="net-worth-history-description">
              Net-worth history from {history[0].date} to {history.at(-1)!.date}
              in {currency}.
            </desc>
            <line
              x1={inset}
              y1={height - inset}
              x2={width - inset}
              y2={height - inset}
              class="stroke-border"
              vector-effect="non-scaling-stroke"
            />
            {#each series as item (item.key)}
              {#each lines(item.key) as path, index (`${item.key}:${index}`)}
                <path
                  d={path}
                  class={['fill-none', item.className]}
                  stroke-width={item.key === 'combinedNetWorth' ? 3 : 2}
                  stroke-dasharray={item.dash}
                  vector-effect="non-scaling-stroke"
                />
              {/each}
              {#each history as point, index (point.date)}
                {@const value = point[item.key].amountMinor}
                {#if value !== null}
                  <circle
                    cx={x(index)}
                    cy={y(value)}
                    r="4"
                    class={[item.className, 'fill-background']}
                    stroke-width="2"
                    vector-effect="non-scaling-stroke"
                  >
                    <title
                      >{item.label}, {point.date}, {formatMoney(
                        value,
                        currency,
                      )}</title
                    >
                  </circle>
                {/if}
              {/each}
            {/each}
          </svg>
        </div>
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>{history[0].date}</span>
          {#if history.length > 1}<span>{history.at(-1)!.date}</span>{/if}
        </div>
        {#if latest}
          <div
            class="grid gap-3 border-t pt-4 sm:grid-cols-3"
            aria-label={`Latest values on ${latest.date}`}
          >
            {#each series as item (item.key)}
              {@const value = latest[item.key].amountMinor}
              <div>
                <p class="text-xs text-muted-foreground">{item.label}</p>
                <strong class="text-sm">
                  {value === null
                    ? 'Unavailable'
                    : formatMoney(value, currency)}
                </strong>
              </div>
            {/each}
          </div>
        {/if}
        <div class="sr-only">
          {#each history as point (point.date)}
            <p>
              {point.date}: Personal {point.personalNetWorth.amountMinor ===
              null
                ? 'unavailable'
                : formatMoney(point.personalNetWorth.amountMinor, currency)};
              Household {point.householdNetWorth.amountMinor === null
                ? 'unavailable'
                : formatMoney(point.householdNetWorth.amountMinor, currency)};
              Combined accessible {point.combinedNetWorth.amountMinor === null
                ? 'unavailable'
                : formatMoney(point.combinedNetWorth.amountMinor, currency)}.
            </p>
          {/each}
        </div>
      </div>
    {:else}
      <Empty.Root>
        <Empty.Header>
          <Empty.Title>No history yet</Empty.Title>
          <Empty.Description>
            The first daily net-worth value will appear after the scheduled
            snapshot.
          </Empty.Description>
        </Empty.Header>
      </Empty.Root>
    {/if}
  </Card.Content>
</Card.Root>
