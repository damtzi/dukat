<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Button, Card } from '@dukat/ui'
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

    <section class="border-t pt-5" aria-labelledby="explore-title">
      <h2 id="explore-title" class="text-base font-semibold">
        Explore when you’re ready
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Optional ways to make more of Dukat.
      </p>
      <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <a
          class="font-medium underline-offset-4 hover:underline"
          href={resolve('/workspaces/new')}
        >
          Create a Household
        </a>
        {#if personalWorkspace}
          <a
            class="font-medium underline-offset-4 hover:underline"
            href={resolve('/(app)/workspaces/[workspaceId]/budgets', {
              workspaceId: personalWorkspace.id,
            })}
          >
            Set a budget
          </a>
        {/if}
      </div>
      <p class="mt-3 text-xs text-muted-foreground">
        Mortgage and Investments · Coming later
      </p>
    </section>
  {/if}
</div>
