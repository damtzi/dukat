<script lang="ts">
  import { resolve } from '$app/paths'
  import type { CashFlow } from '@dukat/core/csv-import'
  import { Button, Card, Empty, Table } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/PageHeader.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import CashFlowCategories from '$lib/components/insights/CashFlowCategories.svelte'
  import CashFlowPeriodControls from '$lib/components/insights/CashFlowPeriodControls.svelte'
  import MonthlyCashFlowChart from '$lib/components/insights/MonthlyCashFlowChart.svelte'
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

<svelte:head><title>Cash flow · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="cash-flow-title">
  <PageHeader
    id="cash-flow-title"
    title="Cash flow"
    description="Completed income and spending. Transfers and balance corrections are excluded; transaction fees are spending."
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

    {#if previousReporting && !previousReporting.missingRate}
      <Card.Root>
        <Card.Header>
          <Card.Title>Equivalent-period comparison</Card.Title>
          <Card.Description>
            {formatDateRange(range)} compared with {formatDateRange(
              comparisonRange,
            )}.
          </Card.Description>
        </Card.Header>
        <Card.Content>
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
              <Table.Row>
                <Table.Cell>{formatDateRange(range)}</Table.Cell>
                <Table.Cell
                  >{formatMoney(
                    currentReporting.incomeMinor!,
                    currentReporting.currency,
                  )}</Table.Cell
                >
                <Table.Cell
                  >{formatMoney(
                    currentReporting.spendingMinor!,
                    currentReporting.currency,
                  )}</Table.Cell
                >
                <Table.Cell
                  >{formatMoney(
                    currentReporting.netMinor!,
                    currentReporting.currency,
                  )}</Table.Cell
                >
              </Table.Row>
              <Table.Row>
                <Table.Cell>{formatDateRange(comparisonRange)}</Table.Cell>
                <Table.Cell
                  >{formatMoney(
                    previousReporting.incomeMinor!,
                    previousReporting.currency,
                  )}</Table.Cell
                >
                <Table.Cell
                  >{formatMoney(
                    previousReporting.spendingMinor!,
                    previousReporting.currency,
                  )}</Table.Cell
                >
                <Table.Cell
                  >{formatMoney(
                    previousReporting.netMinor!,
                    previousReporting.currency,
                  )}</Table.Cell
                >
              </Table.Row>
            </Table.Body>
          </Table.Root>
        </Card.Content>
      </Card.Root>
    {/if}

    <CashFlowCategories
      reporting={currentReporting}
      currencies={current!.currencies}
      accounts={ledger.accounts}
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
</section>
