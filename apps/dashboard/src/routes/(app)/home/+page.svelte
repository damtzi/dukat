<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import type { MyOverview } from '@dukat/core/overview'
  import { Alert, Badge, Button, Card } from '@dukat/ui'
  import AirplaneIcon from 'phosphor-svelte/lib/Airplane'
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight'
  import CarIcon from 'phosphor-svelte/lib/Car'
  import CurrencyDollarIcon from 'phosphor-svelte/lib/CurrencyDollar'
  import FilmStripIcon from 'phosphor-svelte/lib/FilmStrip'
  import FirstAidIcon from 'phosphor-svelte/lib/FirstAid'
  import ForkKnifeIcon from 'phosphor-svelte/lib/ForkKnife'
  import GiftIcon from 'phosphor-svelte/lib/Gift'
  import GraduationCapIcon from 'phosphor-svelte/lib/GraduationCap'
  import HouseIcon from 'phosphor-svelte/lib/House'
  import PawPrintIcon from 'phosphor-svelte/lib/PawPrint'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import ReceiptIcon from 'phosphor-svelte/lib/Receipt'
  import ShoppingCartIcon from 'phosphor-svelte/lib/ShoppingCart'
  import TagIcon from 'phosphor-svelte/lib/Tag'
  import { accountTypeLabel, formatAccountBalance } from '$lib/account'
  import { overviewDataDependency } from '$lib/api'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import SectionHeader from '$lib/components/dashboard/section-header.svelte'
  import SpendingComparisonChart from '$lib/components/overview/spending-comparison-chart.svelte'
  import { formatMoney } from '$lib/money'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  let overview = $derived(data.overview)
  let personalWorkspace = $derived(
    overview?.workspaces.find((workspace) => workspace.type === 'personal'),
  )
  let balanceComposition = $derived.by(() => {
    const currentOverview = overview
    if (
      !currentOverview ||
      currentOverview.personalNetWorth.amountMinor === null ||
      currentOverview.householdNetWorth.amountMinor === null
    ) {
      return null
    }
    const personal = BigInt(currentOverview.personalNetWorth.amountMinor)
    const shared = BigInt(currentOverview.householdNetWorth.amountMinor)
    const hasMixedSigns =
      (personal < 0n && shared > 0n) || (personal > 0n && shared < 0n)
    if (hasMixedSigns) return { personalPercent: null, sharedPercent: null }
    const personalMagnitude = personal < 0n ? -personal : personal
    const sharedMagnitude = shared < 0n ? -shared : shared
    const total = personalMagnitude + sharedMagnitude
    if (total === 0n) return { personalPercent: 0, sharedPercent: 0 }
    const percentage = (value: bigint) => Number((value * 1000n) / total) / 10
    const personalPercent = percentage(personalMagnitude)
    return {
      personalPercent,
      sharedPercent: 100 - personalPercent,
    }
  })

  function totalLabel(total: MyOverview['combinedNetWorth']) {
    return total.amountMinor === null || !overview
      ? 'Unavailable'
      : formatMoney(total.amountMinor, overview.reportingCurrency)
  }

  function transactionTitle(
    transaction: MyOverview['recentTransactions'][number],
  ) {
    return (
      transaction.merchant ||
      transaction.description ||
      (transaction.kind === 'income' ? 'Income' : 'Transaction')
    )
  }

  function dateLabel(date: string) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
  }

  function categoryIcon(transaction: MyOverview['recentTransactions'][number]) {
    if (transaction.kind === 'income') return CurrencyDollarIcon
    const category = transaction.categoryName?.toLowerCase() ?? ''
    if (/grocer|supermarket/.test(category)) return ShoppingCartIcon
    if (/food|dining|restaurant|cafe/.test(category)) return ForkKnifeIcon
    if (/home|housing|rent|mortgage/.test(category)) return HouseIcon
    if (/transport|car|fuel|gas/.test(category)) return CarIcon
    if (/travel|flight|hotel/.test(category)) return AirplaneIcon
    if (/health|medical|pharmacy/.test(category)) return FirstAidIcon
    if (/entertainment|movie|cinema/.test(category)) return FilmStripIcon
    if (/education|school|course/.test(category)) return GraduationCapIcon
    if (/gift|donation/.test(category)) return GiftIcon
    if (/pet|animal/.test(category)) return PawPrintIcon
    if (/bill|utilit|subscription/.test(category)) return ReceiptIcon
    return transaction.categoryName ? TagIcon : ReceiptIcon
  }
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
    <Card.Root aria-labelledby="overall-balance-title">
      <Card.Content
        class="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-center"
      >
        <div>
          <p
            id="overall-balance-title"
            class="text-sm font-medium text-muted-foreground"
          >
            Overall balance
          </p>
          <p class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {totalLabel(overview.combinedNetWorth)}
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            Across every account and workspace you can access
          </p>
        </div>
        <div class="flex flex-col gap-3">
          <p class="text-xs font-medium text-muted-foreground">
            Balance composition
          </p>
          <div
            class="flex h-2 overflow-hidden bg-muted"
            role="img"
            aria-label={balanceComposition &&
            balanceComposition.personalPercent !== null
              ? `${balanceComposition.personalPercent}% Personal and ${balanceComposition.sharedPercent}% Shared`
              : balanceComposition
                ? 'Personal and Shared balances have opposite signs'
                : 'Balance composition unavailable'}
          >
            {#if balanceComposition && balanceComposition.personalPercent !== null}
              <span
                class="bg-primary"
                style:width={`${balanceComposition.personalPercent}%`}
              ></span>
              <span
                class="bg-primary/30"
                style:width={`${balanceComposition.sharedPercent}%`}
              ></span>
            {/if}
          </div>
          {#if balanceComposition?.personalPercent === null}
            <p class="text-xs text-muted-foreground">
              Mixed positive and negative balances cannot be shown as shares.
            </p>
          {/if}
          <dl class="grid grid-cols-2 gap-4">
            <div>
              <dt class="flex items-center gap-2 text-xs text-muted-foreground">
                <span class="size-2 bg-primary"></span>Personal
                {#if balanceComposition && balanceComposition.personalPercent !== null}
                  <span>{balanceComposition.personalPercent}%</span>
                {/if}
              </dt>
              <dd class="mt-1 font-semibold">
                {totalLabel(overview.personalNetWorth)}
              </dd>
            </div>
            <div>
              <dt class="flex items-center gap-2 text-xs text-muted-foreground">
                <span class="size-2 bg-primary/30"></span>Shared
                {#if balanceComposition && balanceComposition.sharedPercent !== null}
                  <span>{balanceComposition.sharedPercent}%</span>
                {/if}
              </dt>
              <dd class="mt-1 font-semibold">
                {totalLabel(overview.householdNetWorth)}
              </dd>
            </div>
          </dl>
        </div>
      </Card.Content>
    </Card.Root>

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

      <Card.Root>
        <Card.Header>
          <Card.Title>Recent transactions</Card.Title>
          <Card.Description>Your latest income and expenses.</Card.Description>
        </Card.Header>
        <Card.Content>
          {#if overview.recentTransactions.length > 0}
            <div class="flex flex-col">
              {#each overview.recentTransactions as transaction (transaction.id)}
                {@const CategoryIcon = categoryIcon(transaction)}
                <a
                  class="flex items-start justify-between gap-4 border-b py-3 first:pt-0 last:border-0 last:pb-0 hover:text-primary"
                  href={resolve(
                    '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
                    {
                      workspaceId: transaction.workspaceId,
                      accountId: transaction.accountId,
                    },
                  )}
                >
                  <div class="flex min-w-0 items-center gap-3">
                    <span
                      class="flex size-9 shrink-0 items-center justify-center bg-muted text-muted-foreground"
                      title={transaction.categoryName ?? 'Uncategorized'}
                    >
                      <CategoryIcon class="size-4" aria-hidden="true" />
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">
                        {transactionTitle(transaction)}
                      </p>
                      <p class="truncate text-xs text-muted-foreground">
                        {dateLabel(transaction.date)} · {transaction.categoryName ??
                          'Uncategorized'} · {transaction.accountName}
                      </p>
                    </div>
                  </div>
                  <span
                    class:text-destructive={transaction.kind === 'expense'}
                    class="shrink-0 text-sm font-semibold tabular-nums"
                  >
                    {transaction.kind === 'expense' ? '−' : '+'}{formatMoney(
                      transaction.amountMinor,
                      transaction.currency,
                    )}
                  </span>
                </a>
              {/each}
            </div>
          {:else}
            <p class="py-12 text-center text-sm text-muted-foreground">
              No transactions yet.
            </p>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="accounts-title">
      <SectionHeader
        id="accounts-title"
        title="Accounts"
        description="The balances you can use or owe, in their original currencies."
      />
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {#each overview.accounts as account (account.id)}
          <Card.Root class="flex min-h-44 flex-col">
            <Card.Header class="flex-1">
              <div class="flex items-start justify-between gap-3">
                <Card.Title class="truncate">{account.name}</Card.Title>
                {#if account.archivedAt}<Badge variant="secondary"
                    >Archived</Badge
                  >{/if}
              </div>
              <Card.Description>
                {accountTypeLabel(account.type)} · {account.workspaceName}
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <p class="text-xl font-semibold">
                {formatAccountBalance(account)}
              </p>
            </Card.Content>
            <Card.Footer>
              <Button
                class="h-auto px-0"
                variant="link"
                href={resolve(
                  '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
                  {
                    workspaceId: account.workspaceId,
                    accountId: account.id,
                  },
                )}>Go to account <ArrowRightIcon aria-hidden="true" /></Button
              >
            </Card.Footer>
          </Card.Root>
        {/each}
        {#if personalWorkspace}
          <a
            class="flex min-h-44 flex-col items-center justify-center gap-3 border border-dashed p-6 text-center text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground"
            href={resolve('/(app)/workspaces/[workspaceId]/accounts', {
              workspaceId: personalWorkspace.id,
            })}
          >
            <span class="flex size-9 items-center justify-center border"
              ><PlusIcon aria-hidden="true" /></span
            >
            <span>
              <strong class="block text-sm font-medium">New account</strong>
              <span class="mt-1 block text-xs">Add one in Personal</span>
            </span>
          </a>
        {/if}
      </div>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="workspaces-title">
      <SectionHeader
        id="workspaces-title"
        title="Workspaces"
        description="Your personal finances and money managed with other people."
      />
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {#each overview.workspaces as workspace (workspace.id)}
          <Card.Root
            class="flex min-h-44 flex-col"
            aria-label={workspace.type === 'personal'
              ? 'Personal'
              : 'Household'}
          >
            <Card.Header class="flex-1">
              <Card.Title>{workspace.name}</Card.Title>
              <Card.Description>
                {workspace.type === 'personal'
                  ? 'Private to you'
                  : 'Shared with members'}
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <p class="text-xl font-semibold">
                {workspace.netWorthMinor === null
                  ? 'Balance unavailable'
                  : formatMoney(
                      workspace.netWorthMinor,
                      overview.reportingCurrency,
                    )}
              </p>
            </Card.Content>
            <Card.Footer>
              <Button
                class="h-auto px-0"
                variant="link"
                href={resolve('/(app)/workspaces/[workspaceId]', {
                  workspaceId: workspace.id,
                })}
                >Go to workspace <ArrowRightIcon aria-hidden="true" /></Button
              >
            </Card.Footer>
          </Card.Root>
        {/each}
        <a
          class="flex min-h-44 flex-col items-center justify-center gap-3 border border-dashed p-6 text-center text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground"
          href={resolve('/workspaces/new')}
        >
          <span class="flex size-9 items-center justify-center border"
            ><PlusIcon aria-hidden="true" /></span
          >
          <span>
            <strong class="block text-sm font-medium">New workspace</strong>
            <span class="mt-1 block text-xs">Create a shared space</span>
          </span>
        </a>
      </div>
    </section>
  {/if}
</div>
