<script lang="ts">
  import type { WorkspaceBalanceHistoryPoint } from '@dukat/core/overview'
  import { Card, Empty } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let {
    history,
  }: {
    history: WorkspaceBalanceHistoryPoint[]
  } = $props()

  const width = 1000
  const height = 220
  const inset = 24
  let values = $derived(
    history.flatMap(({ balanceMinor }) =>
      balanceMinor === null ? [] : [BigInt(balanceMinor)],
    ),
  )
  let minimum = $derived(
    values.reduce(
      (smallest, value) => (value < smallest ? value : smallest),
      values[0] ?? 0n,
    ),
  )
  let maximum = $derived(
    values.reduce(
      (largest, value) => (value > largest ? value : largest),
      values[0] ?? 0n,
    ),
  )
  let latest = $derived(history.at(-1))
  let paths = $derived.by(() => {
    const result: string[] = []
    let current: string[] = []
    history.forEach((point, index) => {
      if (point.balanceMinor === null) {
        if (current.length) result.push(current.join(' '))
        current = []
      } else {
        current.push(
          `${current.length ? 'L' : 'M'} ${x(index)} ${y(point.balanceMinor)}`,
        )
      }
    })
    if (current.length) result.push(current.join(' '))
    return result
  })

  function x(index: number) {
    if (history.length < 2) return width / 2
    return inset + (index / (history.length - 1)) * (width - inset * 2)
  }

  function y(value: string) {
    if (minimum === maximum) return height / 2
    const ratio = Number(BigInt(value) - minimum) / Number(maximum - minimum)
    return height - inset - ratio * (height - inset * 2)
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title id="account-balance-history-title"
      >Account balance history</Card.Title
    >
    <Card.Description>
      Latest recorded account total for each month, converted to {latest?.reportingCurrency ??
        'the snapshot reporting currency'}. Gaps mean a required exchange rate
      was unavailable.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if history.length > 0}
      <div class="flex flex-col gap-4">
        <div class="overflow-x-auto">
          <a class="sr-only" href="#account-balance-history-title"
            >Account balance chart</a
          >
          <svg
            class="h-56 min-w-[36rem] w-full"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby="account-balance-history-title account-balance-history-description"
            preserveAspectRatio="none"
          >
            <desc id="account-balance-history-description">
              Monthly account balance history from {history[0].date} to
              {history.at(-1)!.date} in {history.at(-1)!.reportingCurrency}.
            </desc>
            <line
              x1={inset}
              y1={height - inset}
              x2={width - inset}
              y2={height - inset}
              class="stroke-border"
              vector-effect="non-scaling-stroke"
            />
            {#each paths as path, index (index)}
              <path
                d={path}
                class="fill-none stroke-chart-1"
                stroke-width="3"
                vector-effect="non-scaling-stroke"
              />
            {/each}
            {#each history as point, index (point.date)}
              {#if point.balanceMinor !== null}
                <circle
                  cx={x(index)}
                  cy={y(point.balanceMinor)}
                  r="4"
                  class="fill-background stroke-chart-1"
                  stroke-width="2"
                  vector-effect="non-scaling-stroke"
                >
                  <title
                    >{point.date}, {formatMoney(
                      point.balanceMinor,
                      point.reportingCurrency,
                    )}</title
                  >
                </circle>
              {/if}
            {/each}
          </svg>
        </div>
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>{history[0].date}</span>
          {#if history.length > 1}<span>{history.at(-1)!.date}</span>{/if}
        </div>
        {#if latest}
          <div class="border-t pt-4">
            <p class="mb-3 text-sm font-medium">
              Latest original account balances · {latest.date}
            </p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {#each latest.accounts as account (account.id)}
                <div class="inset-panel text-sm">
                  <strong>{account.name}</strong>
                  <p>{formatMoney(account.balanceMinor, account.currency)}</p>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        <div class="sr-only">
          {#each history as point (point.date)}
            <p>
              {point.date}: {point.balanceMinor === null
                ? 'Unavailable'
                : formatMoney(point.balanceMinor, point.reportingCurrency)}.
            </p>
          {/each}
        </div>
      </div>
    {:else}
      <Empty.Root>
        <Empty.Header>
          <Empty.Title>No balance history yet</Empty.Title>
          <Empty.Description>
            The first monthly value will appear after account snapshots have
            been recorded.
          </Empty.Description>
        </Empty.Header>
      </Empty.Root>
    {/if}
  </Card.Content>
</Card.Root>
