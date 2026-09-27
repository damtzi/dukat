<script lang="ts">
  import { resolve } from '$app/paths'
  import type { CashFlow } from '@dukat/core/csv-import'
  import { Button, Card, Empty } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import AccountBalanceHistory from '$lib/components/insights/account-balance-history.svelte'
  import CashFlowCategories from '$lib/components/insights/cash-flow-categories.svelte'
  import CashFlowPeriodControls from '$lib/components/insights/cash-flow-period-controls.svelte'
  import MonthlyCashFlowChart from '$lib/components/insights/monthly-cash-flow-chart.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'
  import {
    cashFlowRange,
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
  let error = $state('')
  let requestGeneration = 0
  let currentReporting = $derived(current?.reporting)
  let upcoming = $derived(
    workspace.workspaceForecast?.occurrences.slice(0, 5) ?? [],
  )
  let balanceHistory = $derived(monthlyBalanceHistory(data.balanceHistory))
  let showOriginalCurrencies = $derived(
    !!current &&
      current.currencies.length > 0 &&
      (currentReporting?.missingRate === true ||
        current.currencies.length > 1 ||
        current.currencies.some(
          ({ currency }) => currency !== currentReporting?.currency,
        )),
  )
  async function load(selected: DateRange, generation: number) {
    const request = () =>
      api(
        `/workspaces/${workspace.workspaceId}/cash-flow?startDate=${selected.startDate}&endDate=${selected.endDate}`,
      ) as Promise<CashFlow>
    try {
      const nextCurrent = await request()
      if (generation === requestGeneration) {
        current = nextCurrent
        error = ''
      }
    } catch (cause) {
      if (generation === requestGeneration) error = (cause as Error).message
    }
  }

  $effect(() => {
    const selected = { ...range }
    const generation = ++requestGeneration
    void load(selected, generation)
  })
</script>

<svelte:head><title>Insights · Dukat</title></svelte:head>

<section class="flex flex-col gap-4" aria-labelledby="insights-title">
  <PageHeader
    id="insights-title"
    title="Insights"
    description="Completed income and spending exclude transfers and balance corrections. Fees count as spending."
  />

  <CashFlowPeriodControls bind:preset bind:range {today} />

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

    <CashFlowCategories
      reporting={currentReporting}
      currencies={current!.currencies}
      accounts={ledger.account.items}
    />
  {/if}

  <Card.Root>
    <Card.Header class="gap-3">
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <Card.Title>Upcoming recurring money</Card.Title>
          <Card.Description
            >Next scheduled entries in original currencies.</Card.Description
          >
        </div>
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
        <p class="text-sm text-muted-foreground">No upcoming entries.</p>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if showOriginalCurrencies && current}
    <Card.Root>
      <Card.Header>
        <Card.Title>Original-currency totals</Card.Title>
        <Card.Description>
          {currentReporting?.missingRate
            ? 'Known source amounts; combined reporting total unavailable.'
            : `Source amounts before conversion to ${currentReporting?.currency}.`}
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
