<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button } from '@dukat/ui'
  import type { Snippet } from 'svelte'
  import { workspaceDataDependency } from '$lib/api'
  import AccountDialog from '$lib/components/ledger/AccountDialog.svelte'
  import BalanceCheckDialog from '$lib/components/ledger/BalanceCheckDialog.svelte'
  import HistoryDialog from '$lib/components/ledger/HistoryDialog.svelte'
  import TransactionDialog from '$lib/components/ledger/TransactionDialog.svelte'
  import TransferDialog from '$lib/components/ledger/TransferDialog.svelte'
  import { setWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import { createLedgerController } from '$lib/controllers/ledger-controller.svelte'
  import {
    api,
    WorkspaceController,
    type Workspace,
    type WorkspaceRouteData,
  } from '$lib/controllers/workspace-controller.svelte'

  let {
    data,
    children,
  }: {
    data: WorkspaceRouteData & { workspaces: Workspace[] }
    children: Snippet
  } = $props()

  const workspace = new WorkspaceController({
    getRouteData: () => data,
    getWorkspaces: () => data.workspaces,
    refreshRouteData: () => invalidate(workspaceDataDependency),
  })
  const ledger = createLedgerController({
    getWorkspaceId: () => workspace.workspaceId,
    getPickerAccounts: () => workspace.pickerAccounts,
    loadPickerAccounts: () => workspace.loadPickerAccounts(),
    reloadAccounts: () => workspace.refresh(),
    getRouteData: () => data,
  })
  setWorkspaceDashboardContext({ ledger, workspace })
</script>

{#if workspace.state === 'error'}
  <div class="mx-auto w-full max-w-md">
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Workspace unavailable</Alert.Title>
      <Alert.Description>{workspace.message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={() => workspace.refresh()}
        >Try again</Button
      >
    </Alert.Root>
  </div>
{:else}
  {#if ledger.message || ledger.correctionIntent || ledger.feeIntent}
    <Alert.Root variant="destructive" class="mb-6" role="alert">
      <Alert.Title>Could not save</Alert.Title>
      <Alert.Description>
        {ledger.message || 'A previous action needs attention.'}
      </Alert.Description>
      <div class="mt-3 flex flex-wrap gap-2">
        {#if ledger.correctionIntent}
          <Button
            variant="outline"
            disabled={ledger.pending}
            onclick={() => ledger.retryCorrection()}>Retry correction</Button
          >
          <Button
            variant="outline"
            disabled={ledger.pending}
            onclick={ledger.abandonCorrection}>Dismiss correction retry</Button
          >
        {/if}
        {#if ledger.feeIntent}
          <Button
            variant="outline"
            disabled={ledger.pending}
            onclick={() => ledger.retryFee()}>Retry fee expense</Button
          >
          <Button
            variant="outline"
            disabled={ledger.pending}
            onclick={ledger.abandonFee}>Dismiss fee retry</Button
          >
        {/if}
      </div>
    </Alert.Root>
  {/if}
  {@render children()}
{/if}

<AccountDialog
  bind:open={ledger.accountOpen}
  bind:form={ledger.accountForm}
  editingAccount={ledger.editingAccount}
  error={ledger.accountError}
  pending={ledger.pending}
  currencies={ledger.currencies}
  onsubmit={ledger.saveAccount}
/>
<TransactionDialog
  bind:open={ledger.transactionOpen}
  bind:form={ledger.transactionForm}
  editingTransaction={ledger.editingTransaction}
  error={ledger.transactionError}
  pending={ledger.pending}
  categories={ledger.categories}
  onsubmit={ledger.saveTransaction}
/>
<TransferDialog
  bind:open={ledger.transferOpen}
  bind:form={ledger.transferForm}
  editingTransfer={ledger.editingTransfer}
  error={ledger.transactionError}
  pending={ledger.pending}
  accounts={workspace.pickerAccounts}
  transferDestinations={ledger.transferDestinations}
  quote={(input) =>
    api(`/workspaces/${workspace.workspaceId}/rates/quote`, {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<{
      available: boolean
      suggestedAmountMinor: string | null
      rates: Array<{
        currency: string
        rateToPln: string
        source: string
        effectiveDate: string
        tableNumber: string | null
      }>
    }>}
  onsubmit={ledger.saveTransfer}
/>
<BalanceCheckDialog
  bind:open={ledger.checkOpen}
  bind:form={ledger.checkForm}
  editingCheck={ledger.editingCheck}
  error={ledger.transactionError}
  pending={ledger.pending}
  onsubmit={ledger.saveCheck}
/>
<HistoryDialog
  bind:open={ledger.historyOpen}
  title={ledger.historyTitle}
  history={ledger.history}
  changed={ledger.changed}
/>
