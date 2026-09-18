<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button, Card } from '@dukat/ui'
  import { overviewDataDependency } from '$lib/api'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import AccountSummarySection from '$lib/components/overview/account-summary-section.svelte'
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
  <PageHeader title="Home" description="Your overall money situation." />

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
