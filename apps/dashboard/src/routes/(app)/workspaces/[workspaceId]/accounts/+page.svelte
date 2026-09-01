<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Button } from '@dukat/ui'
  import AccountGrid from '$lib/components/dashboard/AccountGrid.svelte'
  import PageHeader from '$lib/components/dashboard/PageHeader.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'

  const { ledger, workspace } = getWorkspaceDashboardContext()

  function selectAccount(accountId: string) {
    void goto(
      resolve('/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity', {
        workspaceId: workspace.workspaceId,
        accountId,
      }),
    )
  }
</script>

<svelte:head><title>Accounts · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="accounts-title">
  <PageHeader
    id="accounts-title"
    title="Accounts"
    description={`${ledger.accounts.length} ${ledger.accounts.length === 1 ? 'account' : 'accounts'} in this workspace`}
  >
    {#snippet actions()}
      <Button variant="outline" onclick={ledger.newAccount}>Add account</Button>
    {/snippet}
  </PageHeader>
  <AccountGrid
    accounts={ledger.accounts}
    onnew={ledger.newAccount}
    onselect={selectAccount}
  />
</section>
