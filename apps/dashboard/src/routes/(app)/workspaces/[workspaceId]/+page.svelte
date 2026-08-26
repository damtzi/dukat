<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Button, Card } from '@dukat/ui'
  import AccountGrid from '$lib/components/dashboard/AccountGrid.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import SummarySection from '$lib/components/insights/SummarySection.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'
  import { formatMoney } from '$lib/money'

  const { ledger, workspace } = getWorkspaceDashboardContext()
  let activeWorkspace = $derived(
    workspace.workspaces.find(({ id }) => id === workspace.workspaceId) ?? null,
  )

  function selectAccount(accountId: string) {
    void goto(
      resolve('/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity', {
        workspaceId: workspace.workspaceId,
        accountId,
      }),
    )
  }
</script>

<svelte:head><title>Overview · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="overview-title">
  <div>
    <p class="text-sm font-medium text-primary">Financial cockpit</p>
    <h1 id="overview-title" class="text-3xl font-semibold tracking-tight">
      Overview
    </h1>
    <p class="mt-1 text-muted-foreground">
      Current balances, monthly flow, and the next 12 months.
    </p>
  </div>

  {#key `${workspace.workspaceId}-${workspace.refreshVersion}`}
    {#if workspace.rateStatus?.stale}
      <Alert.Root>
        <Alert.Title>Exchange rates are stale</Alert.Title>
        <Alert.Description>
          The latest cached NBP table is from {workspace.rateStatus.latest
            ?.effectiveDate ?? 'an unknown date'}. Cached rates remain in use.
        </Alert.Description>
      </Alert.Root>
    {/if}

    <div class="grid gap-4 md:grid-cols-3">
      <Card.Root>
        <Card.Header>
          <Card.Description>Combined balance</Card.Description>
          <Card.Title class="text-2xl">
            {#if workspace.convertedBalances && workspace.convertedBalances.totalMinor !== null}
              {formatMoney(
                workspace.convertedBalances.totalMinor,
                workspace.convertedBalances.reportingCurrency,
              )}
            {:else}—{/if}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">
            {workspace.convertedBalances?.reportingCurrency ??
              activeWorkspace?.reportingCurrency ??
              'Reporting currency'}
          </p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>In 12 months</Card.Description>
          <Card.Title class="text-2xl">
            {#if workspace.workspaceForecast && workspace.workspaceForecast.endingBalanceMinor !== null && workspace.workspaceForecast.reportingCurrency}
              {formatMoney(
                workspace.workspaceForecast.endingBalanceMinor,
                workspace.workspaceForecast.reportingCurrency,
              )}
            {:else}—{/if}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">
            Projected workspace balance
          </p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Planned movements</Card.Description>
          <Card.Title class="text-2xl">
            {workspace.workspaceForecast?.occurrences.length ?? 0}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">
            Unmatched items in the forecast
          </p>
        </Card.Content>
      </Card.Root>
    </div>

    {#if workspace.convertedBalances?.totalMinor === null}
      <Alert.Root>
        <Alert.Title>Combined balance unavailable</Alert.Title>
        <Alert.Description>
          An exchange rate is missing. Original account balances remain
          available.
        </Alert.Description>
      </Alert.Root>
    {/if}

    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">Accounts</h2>
        <p class="text-sm text-muted-foreground">
          {ledger.accounts.length}
          {ledger.accounts.length === 1 ? 'account' : 'accounts'} in this workspace
        </p>
      </div>
      <Button variant="outline" onclick={ledger.newAccount}>Add account</Button>
    </div>
    <AccountGrid
      accounts={ledger.accounts}
      onnew={ledger.newAccount}
      onselect={selectAccount}
    />

    <SummarySection
      accounts={ledger.accounts}
      api={(path, options) =>
        api(`/workspaces/${workspace.workspaceId}/summary${path}`, options)}
    />
  {/key}
</section>
