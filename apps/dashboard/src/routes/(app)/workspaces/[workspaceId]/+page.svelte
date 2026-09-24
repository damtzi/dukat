<script lang="ts">
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Empty } from '@dukat/ui'
  import { formatAccountBalance } from '$lib/account'
  import OverviewOutlookChart from '$lib/components/forecast/overview-outlook-chart.svelte'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import OverviewCashFlow from '$lib/components/insights/overview-cash-flow.svelte'
  import OverviewAttention from '$lib/components/overview/overview-attention.svelte'
  import { todayInWarsaw } from '$lib/date'
  import { lowestProjectedBalance } from '$lib/forecast'
  import { formatMoney } from '$lib/money'
  import {
    absoluteMinor,
    overviewAttentionItems,
    significantAccounts,
  } from '$lib/overview'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  const { ledger, workspace } = getWorkspaceDashboardContext()

  let activeAccounts = $derived(
    workspace.accounts.filter(({ archivedAt }) => !archivedAt),
  )
  let convertedAccounts = $derived(workspace.convertedBalances?.accounts ?? [])
  let accountPreview = $derived(significantAccounts(convertedAccounts))
  let largestAccountValue = $derived(
    accountPreview.reduce((largest, account) => {
      const absolute = absoluteMinor(account.convertedBalanceMinor!)
      return absolute > largest ? absolute : largest
    }, 0n),
  )
  let expected = $derived(workspace.workspaceForecast)
  let upcomingRepeats = $derived(expected?.occurrences.slice(0, 5) ?? [])
  let tentative = $derived(data.tentativeForecast)
  let combinedBalance = $derived(
    workspace.convertedBalances?.totalMinor ?? null,
  )
  let currency = $derived(
    workspace.convertedBalances?.reportingCurrency ??
      workspace.activeWorkspace?.reportingCurrency ??
      '',
  )
  let missingRate = $derived(
    workspace.convertedBalances?.missingRate ||
      expected?.missingRate ||
      tentative?.missingRate,
  )
  let lowestExpected = $derived(
    expected ? lowestProjectedBalance(expected) : null,
  )
  let lowestTentative = $derived(
    tentative ? lowestProjectedBalance(tentative) : null,
  )
  let tentativeImpact = $derived(
    tentative?.endingBalanceMinor !== null &&
      tentative?.endingBalanceMinor !== undefined &&
      expected?.endingBalanceMinor !== null &&
      expected?.endingBalanceMinor !== undefined
      ? (
          BigInt(tentative.endingBalanceMinor) -
          BigInt(expected.endingBalanceMinor)
        ).toString()
      : null,
  )
  const today = todayInWarsaw()
  let overdueCount = $derived(
    new Set(
      (tentative ?? expected)?.occurrences
        .filter(({ originalDate }) => originalDate < today)
        .map(({ planId, originalDate }) => `${planId}:${originalDate}`) ?? [],
    ).size,
  )
  let uncategorizedCount = $derived(
    data.cashFlowCurrent?.currencies.reduce(
      (total, value) =>
        total +
        value.groups
          .filter(({ categoryId }) => categoryId === null)
          .reduce((count, group) => count + group.transactions.length, 0),
      0,
    ) ?? 0,
  )
  let uncategorizedAccountId = $derived(
    data.cashFlowCurrent?.currencies
      .flatMap(({ groups }) => groups)
      .find(({ categoryId, transactions }) =>
        Boolean(categoryId === null && transactions.length),
      )?.transactions[0]?.accountId ?? null,
  )
  let staleRate = $derived(
    Boolean(
      workspace.rateStatus?.stale &&
      activeAccounts.some(
        ({ currency: accountCurrency }) => accountCurrency !== currency,
      ),
    ),
  )
  let attentionItems = $derived(
    overviewAttentionItems({
      expectedLowestMinor: lowestExpected,
      tentativeLowestMinor: lowestTentative,
      overdueCount,
      missingRate: Boolean(missingRate),
      uncategorizedCount,
      staleRate,
    }),
  )
  let accountsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/accounts', {
      workspaceId: workspace.workspaceId,
    }),
  )
  let forecastPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/forecast', {
      workspaceId: workspace.workspaceId,
    }),
  )
  let ratesPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/rates', {
      workspaceId: workspace.workspaceId,
    }),
  )
  let categorizationPath = $derived(
    uncategorizedAccountId
      ? resolve(
          '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
          {
            workspaceId: workspace.workspaceId,
            accountId: uncategorizedAccountId,
          },
        )
      : accountsPath,
  )
  function barWidth(value: string) {
    if (largestAccountValue === 0n) return 0
    const absolute = absoluteMinor(value)
    return Math.max(4, Number((absolute * 100n) / largestAccountValue))
  }
</script>

<svelte:head><title>Overview · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="overview-title">
  <PageHeader
    id="overview-title"
    title="Overview"
    description="What you have now and what may be ahead."
  >
    {#snippet actions()}
      {#if activeAccounts.length > 0}
        <Button onclick={() => ledger.transaction.create()}
          >Add transaction</Button
        >
      {/if}
    {/snippet}
  </PageHeader>

  {#key `${workspace.workspaceId}-${workspace.refreshVersion}`}
    {#if activeAccounts.length === 0}
      <Empty.Root>
        <Empty.Header>
          <Empty.Title>No accounts</Empty.Title>
          <Empty.Description>
            Add a current, savings, cash, or credit-card account to see your
            balance and outlook.
          </Empty.Description>
        </Empty.Header>
        <Empty.Content>
          <Button onclick={ledger.account.create}>Add account</Button>
        </Empty.Content>
      </Empty.Root>
    {:else if missingRate}
      <Card.Root>
        <Card.Header>
          <Card.Description>Your balance</Card.Description>
          <Card.Title>Combined outlook unavailable</Card.Title>
          <Card.Description>
            An exchange rate is missing, so Dukat will not estimate a combined
            balance or graph. Known values remain in their original currencies.
          </Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each activeAccounts as account (account.id)}
            <div class="inset-panel">
              <strong>{account.name}</strong>
              <p class="text-sm text-muted-foreground">
                {formatAccountBalance(account)}
              </p>
            </div>
          {/each}
        </Card.Content>
        <Card.Footer>
          <Button href={ratesPath}>Review exchange rates</Button>
        </Card.Footer>
      </Card.Root>
    {:else if expected && currency && combinedBalance !== null && expected.startingBalanceMinor !== null && expected.endingBalanceMinor !== null && lowestExpected !== null}
      <Card.Root>
        <Card.Header class="gap-5">
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <p class="text-sm font-medium text-muted-foreground">
                Your balance
              </p>
              <p class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {formatMoney(combinedBalance, currency)}
              </p>
            </div>
            <Button variant="outline" href={forecastPath}>View forecast</Button>
          </div>
          <div>
            <h2 class="text-xl font-semibold">Outlook</h2>
            <p class="text-sm text-muted-foreground">
              Expected 12-month projection from current balances and upcoming
              recurring entries. These values may change and are not guaranteed.
            </p>
          </div>
        </Card.Header>
        <Card.Content class="flex flex-col gap-5">
          <div
            class={[
              'grid gap-4',
              tentativeImpact === null ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
            ]}
          >
            <div>
              <p class="text-sm font-medium text-muted-foreground">
                Projected ending balance
              </p>
              <strong class="mt-1 block text-lg tabular-nums">
                {formatMoney(expected.endingBalanceMinor, currency)}
              </strong>
            </div>
            <div>
              <p class="text-sm font-medium text-muted-foreground">
                Lowest projected balance
              </p>
              <strong class="mt-1 block text-lg tabular-nums">
                {formatMoney(lowestExpected, currency)}
              </strong>
            </div>
            {#if tentativeImpact !== null}
              <div>
                <p class="text-sm font-medium text-muted-foreground">
                  Tentative ending impact
                </p>
                <strong class="mt-1 block text-lg tabular-nums">
                  {BigInt(tentativeImpact) > 0n ? '+' : ''}{formatMoney(
                    tentativeImpact,
                    currency,
                  )}
                </strong>
                <p class="mt-1 text-xs text-muted-foreground">
                  Not included in the expected line
                </p>
              </div>
            {/if}
          </div>

          {#if (tentative ?? expected).occurrences.length === 0}
            <Empty.Root class="border bg-muted/20">
              <Empty.Header>
                <Empty.Title>No recurring entries</Empty.Title>
                <Empty.Description>
                  Use Repeat when adding an expense or income to show it here.
                </Empty.Description>
              </Empty.Header>
              <Empty.Content>
                <Button onclick={() => ledger.transaction.create()}
                  >Add recurring entry</Button
                >
              </Empty.Content>
            </Empty.Root>
          {:else}
            <div class="flex flex-col gap-3">
              <p class="text-sm font-medium">Expected monthly balance</p>
              <OverviewOutlookChart {expected} />
              <p class="text-sm text-muted-foreground">
                The line connects expected projected balances at monthly
                intervals.
              </p>
              <div class="border-t pt-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h3 class="font-semibold">Upcoming recurring entries</h3>
                  <span class="text-sm text-muted-foreground"
                    >Next {upcomingRepeats.length}</span
                  >
                </div>
                <div class="flex flex-col gap-2">
                  {#each upcomingRepeats as item (`${item.planId}:${item.originalDate}`)}
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
              </div>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {:else}
      <Alert.Root>
        <Alert.Title>Outlook unavailable</Alert.Title>
        <Alert.Description>
          Dukat could not load the current combined balance and forecast.
        </Alert.Description>
      </Alert.Root>
    {/if}

    {#if activeAccounts.length > 0 && attentionItems.length > 0}
      <OverviewAttention
        items={attentionItems}
        {currency}
        {forecastPath}
        {categorizationPath}
        {ratesPath}
        latestRateDate={workspace.rateStatus?.latest?.effectiveDate ?? null}
      />
    {/if}

    {#if activeAccounts.length > 0}
      <div
        class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <OverviewCashFlow
          workspaceId={workspace.workspaceId}
          current={data.cashFlowCurrent}
          previous={data.cashFlowPrevious}
          currentRange={data.cashFlowCurrentRange}
          previousRange={data.cashFlowPreviousRange}
          showRatesAction={!missingRate}
        />

        <Card.Root class="h-full min-w-0">
          <Card.Header class="gap-3">
            <div>
              <Card.Title>Accounts</Card.Title>
              <Card.Description>
                Significant active balances in {currency ||
                  'the reporting currency'}.
              </Card.Description>
            </div>
            <Button class="self-start" variant="outline" href={accountsPath}
              >View all accounts</Button
            >
          </Card.Header>
          <Card.Content>
            {#if accountPreview.length > 0}
              <div class="flex flex-col gap-5">
                {#each accountPreview as account (account.id)}
                  <div class="flex min-w-0 flex-col gap-2">
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <strong class="block truncate">{account.name}</strong>
                        <span class="text-sm text-muted-foreground">
                          {formatAccountBalance(account)}
                        </span>
                      </div>
                      <strong class="shrink-0 text-right">
                        {formatAccountBalance({
                          ...account,
                          balanceMinor: account.convertedBalanceMinor!,
                          currency,
                        })}
                      </strong>
                    </div>
                    <div
                      class="h-2 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        class={[
                          'h-full rounded-full',
                          BigInt(account.convertedBalanceMinor!) < 0n
                            ? 'bg-destructive'
                            : 'bg-primary',
                        ]}
                        style:width={`${barWidth(account.convertedBalanceMinor!)}%`}
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">
                Converted account values are unavailable.
              </p>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
  {/key}
</section>
