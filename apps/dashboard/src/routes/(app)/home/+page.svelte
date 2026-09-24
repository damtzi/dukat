<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Badge, Button, Card } from '@dukat/ui'
  import { overviewDataDependency } from '$lib/api'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import AccountSummarySection from '$lib/components/overview/account-summary-section.svelte'
  import CreditCardObligations from '$lib/components/overview/credit-card-obligations.svelte'
  import OverallBalanceCard from '$lib/components/overview/overall-balance-card.svelte'
  import RecentTransactionsCard from '$lib/components/overview/recent-transactions-card.svelte'
  import SpendingComparisonChart from '$lib/components/overview/spending-comparison-chart.svelte'
  import WorkspaceSummarySection from '$lib/components/overview/workspace-summary-section.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  let overview = $derived(data.overview)
  let personalWorkspace = $derived(
    overview?.workspaces.find((workspace) => workspace.type === 'personal'),
  )
</script>

<svelte:head><title>Home · Dukat</title></svelte:head>

<div class="flex w-full flex-col gap-6">
  <PageHeader
    title="Home"
    description="Your available money and recent activity."
  />

  {#if data.overviewError}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Home unavailable</Alert.Title>
      <Alert.Description>{data.overviewError}</Alert.Description>
      <Button
        class="mt-3"
        variant="outline"
        onclick={() => invalidate(overviewDataDependency)}>Try again</Button
      >
    </Alert.Root>
  {:else if overview}
    <OverallBalanceCard {overview} />

    <Card.Root>
      <Card.Header>
        <Card.Title>Explore when you’re ready</Card.Title>
        <Card.Description>
          Your Home works without these optional tools.
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3 sm:grid-cols-2">
        <a
          class="border p-4 transition-colors hover:bg-muted/40"
          href={resolve('/workspaces/new')}
        >
          <strong class="text-sm font-medium">Household</strong>
          <p class="mt-1 text-sm text-muted-foreground">
            Create a shared workspace, then invite someone.
          </p>
        </a>
        {#if personalWorkspace}
          <a
            class="border p-4 transition-colors hover:bg-muted/40"
            href={resolve('/(app)/workspaces/[workspaceId]/budgets', {
              workspaceId: personalWorkspace.id,
            })}
          >
            <strong class="text-sm font-medium">Budgets</strong>
            <p class="mt-1 text-sm text-muted-foreground">
              Set monthly limits for spending categories.
            </p>
          </a>
        {/if}
        <div class="border p-4">
          <div class="flex items-center justify-between gap-3">
            <strong class="text-sm font-medium">Mortgage</strong>
            <Badge variant="secondary">Coming later</Badge>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">
            Compare repayment and overpayment scenarios.
          </p>
        </div>
        <div class="border p-4">
          <div class="flex items-center justify-between gap-3">
            <strong class="text-sm font-medium">Investments</strong>
            <Badge variant="secondary">Coming later</Badge>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">
            Track holdings and their current value.
          </p>
        </div>
      </Card.Content>
    </Card.Root>

    <CreditCardObligations obligations={overview.cardObligations} />

    <section
      class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]"
      aria-label="Monthly activity"
    >
      <Card.Root>
        <Card.Header>
          <Card.Title>Spending this month</Card.Title>
          <Card.Description>
            Cumulative spending compared with your previous 3-month average.
          </Card.Description>
        </Card.Header>
        <Card.Content class="px-6">
          <SpendingComparisonChart
            comparison={overview.spendingComparison}
            currency={overview.reportingCurrency}
            currentAmountMinor={overview.currentMonthSpending.amountMinor}
          />
        </Card.Content>
      </Card.Root>

      <RecentTransactionsCard transactions={overview.recentTransactions} />
    </section>

    <AccountSummarySection
      accounts={overview.accounts}
      personalWorkspaceId={personalWorkspace?.id}
    />

    <WorkspaceSummarySection
      workspaces={overview.workspaces}
      reportingCurrency={overview.reportingCurrency}
    />
  {/if}
</div>
