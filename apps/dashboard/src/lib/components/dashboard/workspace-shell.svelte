<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button } from '@dukat/ui'
  import type { Snippet } from 'svelte'
  import { workspaceDataDependency } from '$lib/api'
  import AccountDialog from '$lib/components/ledger/account-dialog.svelte'
  import BalanceCheckDialog from '$lib/components/ledger/balance-check-dialog.svelte'
  import HistoryDialog from '$lib/components/ledger/history-dialog.svelte'
  import TransactionDialog from '$lib/components/ledger/transaction-dialog.svelte'
  import TransferDialog from '$lib/components/ledger/transfer-dialog.svelte'
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
  {#if ledger.status.message || ledger.reconciliation.correctionIntent || ledger.transfer.feeIntent}
    <Alert.Root variant="destructive" class="mb-6" role="alert">
      <Alert.Title>Could not save</Alert.Title>
      <Alert.Description>
        {ledger.status.message || 'A previous action needs attention.'}
      </Alert.Description>
      <div class="mt-3 flex flex-wrap gap-2">
        {#if ledger.reconciliation.correctionIntent}
          <Button
            variant="outline"
            disabled={ledger.status.pending}
            onclick={() => ledger.reconciliation.retryCorrection()}
            >Retry correction</Button
          >
          <Button
            variant="outline"
            disabled={ledger.status.pending}
            onclick={ledger.reconciliation.abandonCorrection}
            >Dismiss correction retry</Button
          >
        {/if}
        {#if ledger.transfer.feeIntent}
          <Button
            variant="outline"
            disabled={ledger.status.pending}
            onclick={() => ledger.transfer.retryFee()}>Retry fee expense</Button
          >
          <Button
            variant="outline"
            disabled={ledger.status.pending}
            onclick={ledger.transfer.abandonFee}>Dismiss fee retry</Button
          >
        {/if}
      </div>
    </Alert.Root>
  {/if}
  {@render children()}
{/if}

<AccountDialog
  bind:open={ledger.account.dialog.open}
  bind:form={ledger.account.dialog.form}
  editingAccount={ledger.account.dialog.editing}
  error={ledger.account.dialog.error}
  pending={ledger.status.pending}
  currencies={ledger.account.currencies}
  onsubmit={ledger.account.save}
/>
<TransactionDialog
  bind:open={ledger.transaction.dialog.open}
  bind:form={ledger.transaction.dialog.form}
  editingTransaction={ledger.transaction.dialog.editing}
  editingHouseholdExpense={ledger.transaction.dialog.editingHouseholdExpense}
  creatingHouseholdExpense={ledger.transaction.dialog.creatingHouseholdExpense}
  refundingExpense={ledger.transaction.dialog.refundingExpense}
  error={ledger.transaction.dialog.error}
  pending={ledger.status.pending}
  categories={data.categories}
  accounts={ledger.transaction.dialog.creatingHouseholdExpense
    ? ledger.transaction.householdExpenseAccounts()
    : data.accounts}
  recentMerchants={ledger.transaction.dialog.recentMerchants}
  recentCategoryIds={ledger.transaction.dialog.recentCategoryIds}
  onsubmit={ledger.transaction.save}
/>
<TransferDialog
  bind:open={ledger.transfer.dialog.open}
  bind:form={ledger.transfer.dialog.form}
  editingTransfer={ledger.transfer.dialog.editing}
  error={ledger.transfer.dialog.error}
  pending={ledger.status.pending}
  accounts={workspace.pickerAccounts}
  transferDestinations={ledger.transfer.destinations}
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
  onsubmit={ledger.transfer.save}
/>
<BalanceCheckDialog
  bind:open={ledger.reconciliation.dialog.open}
  bind:form={ledger.reconciliation.dialog.form}
  editingCheck={ledger.reconciliation.dialog.editing}
  error={ledger.reconciliation.dialog.error}
  pending={ledger.status.pending}
  onsubmit={ledger.reconciliation.save}
/>
<HistoryDialog
  bind:open={ledger.history.dialog.open}
  title={ledger.history.dialog.title}
  history={ledger.history.dialog.entries}
  changed={ledger.history.changed}
/>
