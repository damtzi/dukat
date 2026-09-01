<script lang="ts">
  import { resolve } from '$app/paths'
  import type { CashFlow } from '@dukat/core/csv-import'
  import { Button, Card, Empty, Table } from '@dukat/ui'
  import { formatDateRange, type DateRange } from '$lib/date'
  import { formatMoney } from '$lib/money'
  import { overviewSpendingCategories } from '$lib/overview'

  let {
    workspaceId,
    current,
    previous,
    currentRange,
    previousRange,
    showRatesAction,
  }: {
    workspaceId: string
    current: CashFlow | null
    previous: CashFlow | null
    currentRange: DateRange
    previousRange: DateRange
    showRatesAction: boolean
  } = $props()

  let currentReporting = $derived(current?.reporting)
  let previousReporting = $derived(previous?.reporting)
  let unavailable = $derived(
    currentReporting?.missingRate || previousReporting?.missingRate,
  )
  let categories = $derived(
    overviewSpendingCategories(currentReporting?.spendingCategories ?? []),
  )
  let largestCategory = $derived(
    categories.reduce(
      (largest, category) =>
        BigInt(category.amountMinor) > largest
          ? BigInt(category.amountMinor)
          : largest,
      1n,
    ),
  )
  let largestBar = $derived.by(() => {
    const values = [
      currentReporting?.incomeMinor,
      currentReporting?.spendingMinor,
      previousReporting?.incomeMinor,
      previousReporting?.spendingMinor,
    ]
    return values.reduce(
      (largest, value) =>
        value !== null && value !== undefined && BigInt(value) > largest
          ? BigInt(value)
          : largest,
      1n,
    )
  })
  let netDifference = $derived(
    currentReporting?.netMinor !== null &&
      currentReporting?.netMinor !== undefined &&
      previousReporting?.netMinor !== null &&
      previousReporting?.netMinor !== undefined
      ? (
          BigInt(currentReporting.netMinor) - BigInt(previousReporting.netMinor)
        ).toString()
      : null,
  )
  let cashFlowPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/cash-flow', { workspaceId }),
  )
  let ratesPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/rates', { workspaceId }),
  )
  let importsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/imports', { workspaceId }),
  )

  function barHeight(value: string) {
    return Number((BigInt(value) * 100n) / largestBar)
  }

  function categoryWidth(value: string) {
    return Number((BigInt(value) * 100n) / largestCategory)
  }
</script>

<Card.Root class="h-full min-w-0">
  <Card.Header class="gap-3">
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <Card.Title>This month</Card.Title>
        <Card.Description>
          Month-to-date income and spending in the reporting currency.
        </Card.Description>
      </div>
      {#if current && previous && current.currencies.length > 0 && !unavailable}
        <Button variant="outline" href={cashFlowPath}>View cash flow</Button>
      {/if}
    </div>
  </Card.Header>
  <Card.Content class="min-w-0">
    {#if !current || !previous}
      <Empty.Root>
        <Empty.Header>
          <Empty.Title>Cash flow unavailable</Empty.Title>
          <Empty.Description>
            Dukat could not load this month’s completed transactions.
          </Empty.Description>
        </Empty.Header>
        <Empty.Content>
          <Button href={cashFlowPath}>View cash flow</Button>
        </Empty.Content>
      </Empty.Root>
    {:else if current.currencies.length === 0}
      <Empty.Root>
        <Empty.Header>
          <Empty.Title>No completed transactions this month</Empty.Title>
          <Empty.Description>
            Import transactions to see this month’s cash flow.
          </Empty.Description>
        </Empty.Header>
        <Empty.Content>
          <Button href={importsPath}>Import transactions</Button>
        </Empty.Content>
      </Empty.Root>
    {:else if unavailable}
      <Empty.Root>
        <Empty.Header>
          <Empty.Title>Combined cash flow unavailable</Empty.Title>
          <Empty.Description>
            An exchange rate is missing, so Dukat will not estimate combined
            totals. Known original-currency amounts remain below.
          </Empty.Description>
        </Empty.Header>
        <Empty.Content class="w-full">
          <div class="grid gap-2 text-left sm:grid-cols-2">
            {#each current.currencies as currency (currency.currency)}
              <div class="inset-panel text-sm">
                <strong>{currency.currency}</strong>
                <p>
                  Income {formatMoney(currency.incomeMinor, currency.currency)}
                </p>
                <p>
                  Spending {formatMoney(
                    currency.spendingMinor,
                    currency.currency,
                  )}
                </p>
              </div>
            {/each}
          </div>
          {#if showRatesAction}
            <Button class="mt-3" href={ratesPath}>Review exchange rates</Button>
          {/if}
        </Empty.Content>
      </Empty.Root>
    {:else if currentReporting && previousReporting}
      {@const periods = [
        { label: formatDateRange(previousRange), value: previousReporting },
        { label: formatDateRange(currentRange), value: currentReporting },
      ]}
      <div class="flex min-w-0 flex-col gap-6">
        <div class="grid gap-3 sm:grid-cols-3">
          <div>
            <p class="text-sm text-muted-foreground">Income</p>
            <strong class="text-lg">
              {formatMoney(
                currentReporting.incomeMinor!,
                currentReporting.currency,
              )}
            </strong>
          </div>
          <div>
            <p class="text-sm text-muted-foreground">Spending</p>
            <strong class="text-lg">
              {formatMoney(
                currentReporting.spendingMinor!,
                currentReporting.currency,
              )}
            </strong>
          </div>
          <div>
            <p class="text-sm text-muted-foreground">Net cash flow</p>
            <strong class="text-lg">
              {formatMoney(
                currentReporting.netMinor!,
                currentReporting.currency,
              )}
            </strong>
          </div>
        </div>

        <section
          class="flex min-w-0 flex-col gap-3"
          aria-labelledby="overview-cash-flow-chart"
        >
          <div>
            <h3 id="overview-cash-flow-chart" class="font-semibold">
              Income and spending comparison
            </h3>
            <p class="text-sm text-muted-foreground">
              {formatDateRange(currentRange)} compared with {formatDateRange(
                previousRange,
              )}. Difference in net cash flow: {formatMoney(
                netDifference!,
                currentReporting.currency,
              )}.
            </p>
          </div>
          <div
            class="grid h-48 grid-cols-2 items-end gap-6 border-b px-3 pt-3"
            role="group"
            aria-labelledby="overview-cash-flow-chart"
          >
            {#each periods as period (period.label)}
              <div class="flex min-w-0 flex-col items-center gap-2">
                <div class="flex h-36 items-end gap-2">
                  <button
                    type="button"
                    class="min-h-1 w-8 bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    style:height={`${barHeight(period.value.incomeMinor!)}%`}
                    aria-label={`${period.label} income ${formatMoney(period.value.incomeMinor!, period.value.currency)}`}
                  ></button>
                  <button
                    type="button"
                    class="min-h-1 w-8 bg-secondary-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    style:height={`${barHeight(period.value.spendingMinor!)}%`}
                    aria-label={`${period.label} spending ${formatMoney(period.value.spendingMinor!, period.value.currency)}`}
                  ></button>
                </div>
                <span class="max-w-full truncate text-xs text-muted-foreground">
                  {period.label}
                </span>
              </div>
            {/each}
          </div>
          <div class="flex flex-wrap gap-5 text-sm" aria-hidden="true">
            <span class="flex items-center gap-2">
              <span class="h-3 w-3 bg-primary"></span>Income
            </span>
            <span class="flex items-center gap-2">
              <span class="h-3 w-3 bg-secondary-foreground/50"></span>Spending
            </span>
          </div>
          <Table.Root
            tabindex={0}
            aria-label="Month-to-date cash-flow comparison"
          >
            <Table.Caption>All compared cash-flow values</Table.Caption>
            <Table.Header>
              <Table.Row>
                <Table.Head>Period</Table.Head>
                <Table.Head>Income</Table.Head>
                <Table.Head>Spending</Table.Head>
                <Table.Head>Net</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each periods as period (period.label)}
                <Table.Row>
                  <Table.Cell>{period.label}</Table.Cell>
                  <Table.Cell>
                    {formatMoney(
                      period.value.incomeMinor!,
                      period.value.currency,
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {formatMoney(
                      period.value.spendingMinor!,
                      period.value.currency,
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {formatMoney(period.value.netMinor!, period.value.currency)}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </section>

        <section
          class="flex flex-col gap-3"
          aria-labelledby="overview-spending-categories"
        >
          <div>
            <h3 id="overview-spending-categories" class="font-semibold">
              Top spending categories
            </h3>
            <p class="text-sm text-muted-foreground">
              Five largest categories; remaining spending is grouped as Other.
            </p>
          </div>
          {#if categories.length === 0}
            <p class="text-sm text-muted-foreground">No spending this month.</p>
          {:else}
            <ol class="flex flex-col gap-3">
              {#each categories as category, index (`${category.categoryId}:${category.categoryName}`)}
                <li
                  class="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 text-sm"
                >
                  <span class="text-muted-foreground">{index + 1}.</span>
                  <span>{category.categoryName}</span>
                  <span
                    class="h-2 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <span
                      class="block h-full rounded-full bg-secondary-foreground/50"
                      style:width={`${categoryWidth(category.amountMinor)}%`}
                    ></span>
                  </span>
                  <strong>
                    {formatMoney(
                      category.amountMinor,
                      currentReporting.currency,
                    )}
                  </strong>
                </li>
              {/each}
            </ol>
          {/if}
        </section>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
