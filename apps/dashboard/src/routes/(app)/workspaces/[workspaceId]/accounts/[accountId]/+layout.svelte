<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { Button, Empty } from '@dukat/ui'
  import { workspaceDataDependency } from '$lib/api'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import AccountSummary from '$lib/components/ledger/AccountSummary.svelte'

  let { children } = $props()
  const { ledger, workspace } = getWorkspaceDashboardContext()
  let account = $derived(ledger.selected())

  async function accountAction(action: 'archive' | 'restore' | 'delete') {
    const workspaceId = workspace.workspaceId
    const completed = await ledger.accountAction(action)
    if (
      !completed ||
      action !== 'delete' ||
      workspace.workspaceId !== workspaceId
    )
      return
    await goto(
      resolve('/(app)/workspaces/[workspaceId]/accounts', {
        workspaceId,
      }),
      { replaceState: true, invalidate: [workspaceDataDependency] },
    )
  }
</script>

<svelte:head><title>{account?.name ?? 'Account'} · Dukat</title></svelte:head>

{#if account}
  <section aria-labelledby="account-title">
    <div class="mb-6">
      <p class="text-sm font-medium text-primary">Account</p>
      <h1 id="account-title" class="text-3xl font-semibold tracking-tight">
        {account.name}
      </h1>
      <p class="mt-1 capitalize text-muted-foreground">
        {account.type} · {account.currency}
      </p>
    </div>

    <AccountSummary
      {account}
      pending={ledger.pending}
      onedit={ledger.editAccount}
      onhistory={() =>
        ledger.showHistory('accounts', account.id, `${account.name} history`)}
      onaction={accountAction}
    />

    <nav class="flex flex-wrap gap-1" aria-label="Account sections">
      <Button
        href={resolve(
          '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
          { workspaceId: workspace.workspaceId, accountId: account.id },
        )}
        variant={page.route.id ===
        '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity'
          ? 'secondary'
          : 'ghost'}
        size="sm"
        aria-current={page.route.id ===
        '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity'
          ? 'page'
          : undefined}>Activity</Button
      >
      <Button
        href={resolve(
          '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
          { workspaceId: workspace.workspaceId, accountId: account.id },
        )}
        variant={page.route.id ===
        '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning'
          ? 'secondary'
          : 'ghost'}
        size="sm"
        aria-current={page.route.id ===
        '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning'
          ? 'page'
          : undefined}>Planning</Button
      >
      <Button
        href={resolve(
          '/(app)/workspaces/[workspaceId]/accounts/[accountId]/reconciliation',
          { workspaceId: workspace.workspaceId, accountId: account.id },
        )}
        variant={page.route.id ===
        '/(app)/workspaces/[workspaceId]/accounts/[accountId]/reconciliation'
          ? 'secondary'
          : 'ghost'}
        size="sm"
        aria-current={page.route.id ===
        '/(app)/workspaces/[workspaceId]/accounts/[accountId]/reconciliation'
          ? 'page'
          : undefined}>Reconciliation</Button
      >
    </nav>

    <div class="pt-4">{@render children()}</div>
  </section>
{:else}
  <Empty.Root class="rounded-xl border bg-card">
    <Empty.Header>
      <Empty.Title>Account unavailable</Empty.Title>
      <Empty.Description>
        Choose another account from this workspace.
      </Empty.Description>
    </Empty.Header>
    <Empty.Content>
      <Button
        href={resolve('/(app)/workspaces/[workspaceId]/accounts', {
          workspaceId: workspace.workspaceId,
        })}>View accounts</Button
      >
    </Empty.Content>
  </Empty.Root>
{/if}
