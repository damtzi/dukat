<script lang="ts">
  import { resolve } from '$app/paths'
  import type { CashFlow } from '@dukat/core/csv-import'
  import { Button, Card, Empty, Table } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import AccountBalanceHistory from '$lib/components/insights/account-balance-history.svelte'
  import CashFlowCategories from '$lib/components/insights/cash-flow-categories.svelte'
  import CashFlowPeriodControls from '$lib/components/insights/cash-flow-period-controls.svelte'
  import MonthlyCashFlowChart from '$lib/components/insights/monthly-cash-flow-chart.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'
  import {
    cashFlowRange,
    equivalentCashFlowRange,
    formatDateRange,
    todayInWarsaw,
    type CashFlowPreset,
    type DateRange,
  } from '$lib/date'
  import { formatMoney } from '$lib/money'
  import { monthlyBalanceHistory } from '$lib/overview'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  const { ledger, workspace } = getWorkspaceDashboardContext()
  const today = todayInWarsaw()
  let preset = $state<CashFlowPreset>('12m')
  let range = $state<DateRange>(cashFlowRange('12m', today))
  let current = $state.raw<CashFlow | null>(null)
  let previous = $state.raw<CashFlow | null>(null)
  let error = $state('')
  let requestGeneration = 0
  let comparisonRange = $derived(equivalentCashFlowRange(range, preset))
  let currentReporting = $derived(current?.reporting)
  let previousReporting = $derived(previous?.reporting)
  let upcoming = $derived(
    workspace.workspaceForecast?.occurrences.slice(0, 5) ?? [],
  )
  let balanceHistory = $derived(monthlyBalanceHistory(data.balanceHistory))
  let forecastPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/forecast', {
      workspaceId: workspace.workspaceId,
    }),
  )

  async function load(
    selected: DateRange,
    comparison: DateRange,
    generation: number,
  ) {
    const request = (value: DateRange) =>
      api(
        `/workspaces/${workspace.workspaceId}/cash-flow?startDate=${value.startDate}&endDate=${value.endDate}`,
      ) as Promise<CashFlow>
    try {
      const [nextCurrent, nextPrevious] = await Promise.all([
        request(selected),
        request(comparison),
      ])
      if (generation === requestGeneration) {
        current = nextCurrent
        previous = nextPrevious
        error = ''
      }
    } catch (cause) {
      if (generation === requestGeneration) error = (cause as Error).message
    }
  }

  $effect(() => {
    const selected = { ...range }
    const comparison = comparisonRange
    const generation = ++requestGeneration
    void load(selected, comparison, generation)
  })
</script>

<svelte:head><title>Insights · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="insights-title">
  <PageHeader
    id="insights-title"
    title="Insights"
    description="Completed income, spending, recurring money, and account balances. Transfers and balance corrections are excluded from income and spending; transaction fees are spending."
  />

  <CashFlowPeriodControls bind:preset bind:range {today} />

  <Card.Root>
    <Card.Header class="gap-3">
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <Card.Title>Upcoming recurring money</Card.Title>
          <Card.Description>
            The next scheduled income and expenses, kept in their original
            currencies.
          </Card.Description>
        </div>
        {#if workspace.workspaceForecast}
          <Button class="self-start" variant="outline" href={forecastPath}
            >View all</Button
          >
        {/if}
      </div>
    </Card.Header>
    <Card.Content>
      {#if upcoming.length > 0}
        <div class="flex flex-col gap-2">
          {#each upcoming as item (`${item.planId}:${item.originalDate}`)}
            <div
              class="inset-panel flex items-center justify-between gap-3 text-sm"
            >
              <span
                >{item.date} · {item.kind === 'expense'
                  ? 'Expense'
                  : 'Income'}</span
              >
              <strong class="tabular-nums">
                {item.kind === 'expense' ? '−' : '+'}{formatMoney(
                  item.sourceAmountMinor,
                  item.sourceCurrency,
                )}
              </strong>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">
          No upcoming recurring entries.
        </p>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if error}
    <p class="text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if current && current.currencies.length === 0}
    <Empty.Root>
      <Empty.Header>
        <Empty.Title>No completed transactions in this period</Empty.Title>
        <Empty.Description>
          Import transactions to make cash-flow analysis available.
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button
          href={resolve('/(app)/workspaces/[workspaceId]/imports', {
            workspaceId: workspace.workspaceId,
          })}>Import transactions</Button
        >
      </Empty.Content>
    </Empty.Root>
  {:else if currentReporting?.missingRate}
    <Empty.Root>
      <Empty.Header>
        <Empty.Title>Combined cash flow unavailable</Empty.Title>
        <Empty.Description>
          An exchange rate is missing, so Dukat will not estimate combined
          totals. Known original-currency amounts remain below.
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button
          href={resolve('/(app)/workspaces/[workspaceId]/rates', {
            workspaceId: workspace.workspaceId,
          })}>Review exchange rates</Button
        >
      </Empty.Content>
    </Empty.Root>
  {:else if currentReporting}
    <div class="grid gap-4 sm:grid-cols-3">
      <Card.Root>
        <Card.Header>
          <Card.Description>Income</Card.Description>
          <Card.Title
            >{formatMoney(
              currentReporting.incomeMinor!,
              currentReporting.currency,
            )}</Card.Title
          >
        </Card.Header>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Spending</Card.Description>
          <Card.Title
            >{formatMoney(
              currentReporting.spendingMinor!,
              currentReporting.currency,
            )}</Card.Title
          >
        </Card.Header>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Net cash flow</Card.Description>
          <Card.Title
            >{formatMoney(
              currentReporting.netMinor!,
              currentReporting.currency,
            )}</Card.Title
          >
        </Card.Header>
      </Card.Root>
    </div>

    <MonthlyCashFlowChart
      reporting={currentReporting}
      periodLabel={formatDateRange(range)}
    />

    {#if previousReporting && !previousReporting.missingRate}
      <Card.Root class="min-w-0">
        <Card.Header>
          <Card.Title>Equivalent-period comparison</Card.Title>
          <Card.Description>
            {formatDateRange(range)} compared with {formatDateRange(
              comparisonRange,
            )}.
          </Card.Description>
        </Card.Header>
        <Card.Content class="min-w-0">
          {@const periods = [
            { label: formatDateRange(range), values: currentReporting },
            {
              label: formatDateRange(comparisonRange),
              values: previousReporting,
            },
          ]}
          <div class="flex flex-col gap-3 sm:hidden">
            {#each periods as period (period.label)}
              <div class="inset-panel text-sm">
                <strong>{period.label}</strong>
                <dl class="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <dt class="text-muted-foreground">Income</dt>
                    <dd>
                      {formatMoney(
                        period.values.incomeMinor!,
                        period.values.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted-foreground">Spending</dt>
                    <dd>
                      {formatMoney(
                        period.values.spendingMinor!,
                        period.values.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted-foreground">Net</dt>
                    <dd>
                      {formatMoney(
                        period.values.netMinor!,
                        period.values.currency,
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            {/each}
          </div>
          <div class="hidden sm:block">
            <Table.Root tabindex={0} aria-label="Equivalent-period values">
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
                    <Table.Cell
                      >{formatMoney(
                        period.values.incomeMinor!,
                        period.values.currency,
                      )}</Table.Cell
                    >
                    <Table.Cell
                      >{formatMoney(
                        period.values.spendingMinor!,
                        period.values.currency,
                      )}</Table.Cell
                    >
                    <Table.Cell
                      >{formatMoney(
                        period.values.netMinor!,
                        period.values.currency,
                      )}</Table.Cell
                    >
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <CashFlowCategories
      reporting={currentReporting}
      currencies={current!.currencies}
      accounts={ledger.account.items}
    />
  {/if}

  {#if current && current.currencies.length > 0}
    <Card.Root>
      <Card.Header>
        <Card.Title>Original-currency totals</Card.Title>
        <Card.Description>
          Known values stay available even when conversion is unavailable.
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3 sm:grid-cols-2">
        {#each current.currencies as currency (currency.currency)}
          <div class="inset-panel text-sm">
            <strong>{currency.currency}</strong>
            <p>Income {formatMoney(currency.incomeMinor, currency.currency)}</p>
            <p>
              Spending {formatMoney(currency.spendingMinor, currency.currency)}
            </p>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}

  <AccountBalanceHistory history={balanceHistory} />
</section>
