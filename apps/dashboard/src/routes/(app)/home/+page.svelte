<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import type { MyOverview } from '@dukat/core/overview'
  import { Alert, Badge, Button, Card, Empty } from '@dukat/ui'
  import { formatAccountBalance } from '$lib/account'
  import { overviewDataDependency } from '$lib/api'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import NetWorthHistoryChart from '$lib/components/overview/net-worth-history-chart.svelte'
  import { formatMoney } from '$lib/money'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  let overview = $derived(data.overview)
  let hasMissingRate = $derived(
    Boolean(
      overview?.combinedNetWorth.missingRate ||
      overview?.currentMonthSpending.missingRate,
    ),
  )

  function totalLabel(total: MyOverview['combinedNetWorth']) {
    return total.amountMinor === null || !overview
      ? 'Unavailable'
      : formatMoney(total.amountMinor, overview.reportingCurrency)
  }
</script>

{#snippet NetWorth(
  title: string,
  total: MyOverview['combinedNetWorth'],
  description: string,
)}
  <div class="flex min-w-0 flex-col gap-1">
    <p class="text-sm text-muted-foreground">{title}</p>
    <strong class="text-xl">{totalLabel(total)}</strong>
    <p class="text-xs text-muted-foreground">{description}</p>
  </div>
{/snippet}

<svelte:head><title>My overview · Dukat</title></svelte:head>

<div class="flex w-full flex-col gap-6">
  <PageHeader
    title="My overview"
    description="Your private view of Personal and accessible Household finances."
  >
    {#snippet actions()}
      <Button href={resolve('/workspaces/new')}>New Household workspace</Button>
    {/snippet}
  </PageHeader>

  {#if data.overviewError}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>My overview unavailable</Alert.Title>
      <Alert.Description>{data.overviewError}</Alert.Description>
      <Button
        class="mt-3"
        variant="outline"
        onclick={() => invalidate(overviewDataDependency)}>Try again</Button
      >
    </Alert.Root>
  {:else if overview}
    <section
      class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"
      aria-label="Overview summary"
    >
      <Card.Root class="order-2 lg:order-1">
        <Card.Header>
          <Card.Title>Accessible net worth</Card.Title>
          <Card.Description>
            Household values show access, not legal ownership or ownership
            percentages.
          </Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-5 sm:grid-cols-3">
          {@render NetWorth(
            'Personal',
            overview.personalNetWorth,
            'Private to you',
          )}
          {@render NetWorth(
            'Household',
            overview.householdNetWorth,
            'Each workspace counted once',
          )}
          {@render NetWorth(
            'Combined accessible',
            overview.combinedNetWorth,
            'Personal plus Household',
          )}
        </Card.Content>
      </Card.Root>

      <Card.Root class="order-1 lg:order-2">
        <Card.Header>
          <Card.Title>Now and next</Card.Title>
          <Card.Description
            >Current-month spending and expected cash.</Card.Description
          >
        </Card.Header>
        <Card.Content class="flex flex-col gap-4">
          <div>
            <p class="text-sm text-muted-foreground">Current-month spending</p>
            <strong class="text-xl">
              {overview.currentMonthSpending.amountMinor === null
                ? 'Unavailable'
                : formatMoney(
                    overview.currentMonthSpending.amountMinor,
                    overview.reportingCurrency,
                  )}
            </strong>
            {#if overview.currentMonthSpending.missingRate}
              <p class="text-xs text-muted-foreground">
                {overview.currentMonthSpending.originals
                  .map(({ amountMinor, currency }) =>
                    formatMoney(amountMinor, currency),
                  )
                  .join(' · ') || 'No recorded spending'}
              </p>
            {/if}
          </div>
          <div>
            <p class="text-sm text-muted-foreground">Upcoming expected cash</p>
            {#if overview.upcoming.length > 0}
              {@const next = overview.upcoming[0]}
              <strong class="text-base">
                {next.kind === 'expense' ? '−' : '+'}{formatMoney(
                  next.convertedAmountMinor ?? next.amountMinor,
                  next.convertedAmountMinor === null
                    ? next.currency
                    : overview.reportingCurrency,
                )}
              </strong>
              <p class="text-xs text-muted-foreground">
                {next.date} · {next.workspaceName}
              </p>
            {:else}
              <p class="text-sm">No expected transactions</p>
            {/if}
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    {#if hasMissingRate}
      <Alert.Root role="status">
        <Alert.Title>Some combined values are unavailable</Alert.Title>
        <Alert.Description>
          A required exchange rate is missing. Dukat omits affected totals and
          keeps original values below.
        </Alert.Description>
      </Alert.Root>
    {/if}

    <NetWorthHistoryChart
      history={overview.history}
      currency={overview.reportingCurrency}
    />

    <section class="grid gap-6 lg:grid-cols-2" aria-label="Overview details">
      <Card.Root>
        <Card.Header>
          <Card.Title>Account balances</Card.Title>
          <Card.Description
            >All accounts you can access, in their original currencies.</Card.Description
          >
        </Card.Header>
        <Card.Content>
          {#if overview.accounts.length > 0}
            <div class="flex flex-col gap-4">
              {#each overview.accounts as account (account.id)}
                <div
                  class="flex items-start justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
                >
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <strong class="truncate">{account.name}</strong>
                      {#if account.type === 'credit_card'}<Badge
                          variant="outline">Debt</Badge
                        >{/if}
                      {#if account.archivedAt}<Badge variant="secondary"
                          >Archived</Badge
                        >{/if}
                    </div>
                    <p class="text-sm text-muted-foreground">
                      {account.workspaceName} · {account.workspaceType ===
                      'personal'
                        ? 'Personal'
                        : 'Household'}
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <strong>{formatAccountBalance(account)}</strong>
                    {#if account.convertedBalanceMinor !== null && account.currency !== overview.reportingCurrency}
                      <p class="text-xs text-muted-foreground">
                        {formatMoney(
                          account.convertedBalanceMinor,
                          overview.reportingCurrency,
                        )}
                      </p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <Empty.Root>
              <Empty.Header>
                <Empty.Title>No accounts</Empty.Title>
                <Empty.Description
                  >Add an account in a workspace to track its balance.</Empty.Description
                >
              </Empty.Header>
            </Empty.Root>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Upcoming expected cash</Card.Title>
          <Card.Description
            >Expected unmatched plans across accessible workspaces.</Card.Description
          >
        </Card.Header>
        <Card.Content>
          {#if overview.upcoming.length > 0}
            <div class="flex flex-col gap-4">
              {#each overview.upcoming.slice(0, 6) as item (`${item.workspaceId}:${item.planId}:${item.date}`)}
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <strong
                      >{item.kind === 'income'
                        ? 'Expected income'
                        : 'Expected expense'}</strong
                    >
                    <p class="text-sm text-muted-foreground">
                      {item.date} · {item.workspaceName} · {item.accountName}
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <strong
                      >{item.kind === 'expense' ? '−' : '+'}{formatMoney(
                        item.amountMinor,
                        item.currency,
                      )}</strong
                    >
                    {#if item.convertedAmountMinor !== null && item.currency !== overview.reportingCurrency}
                      <p class="text-xs text-muted-foreground">
                        {formatMoney(
                          item.convertedAmountMinor,
                          overview.reportingCurrency,
                        )}
                      </p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">
              No expected transactions in the next 12 months.
            </p>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="workspaces-title">
      <h2 id="workspaces-title" class="text-lg font-semibold">Workspaces</h2>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {#each overview.workspaces as workspace (workspace.id)}
          <Card.Root
            aria-label={workspace.type === 'personal'
              ? 'Personal'
              : 'Household'}
          >
            <Card.Header>
              <Card.Title>{workspace.name}</Card.Title>
              <Card.Description>
                {workspace.type === 'personal'
                  ? 'Personal · Private to you'
                  : 'Household · Shared with members'}
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <strong>
                {workspace.netWorthMinor === null
                  ? 'Net worth unavailable'
                  : formatMoney(
                      workspace.netWorthMinor,
                      overview.reportingCurrency,
                    )}
              </strong>
            </Card.Content>
            <Card.Footer>
              <Button
                href={resolve('/(app)/workspaces/[workspaceId]', {
                  workspaceId: workspace.id,
                })}
                variant="outline">Open workspace</Button
              >
            </Card.Footer>
          </Card.Root>
        {/each}
      </div>
    </section>
  {/if}
</div>
