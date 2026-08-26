<script lang="ts">
  import { goto, invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Button, Empty, Separator, Sidebar } from '@dukat/ui'
  import type { Snippet } from 'svelte'
  import { workspaceDataDependency } from '$lib/api'
  import DashboardSidebar from '$lib/components/dashboard/DashboardSidebar.svelte'
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
    type WorkspaceRouteData,
  } from '$lib/controllers/workspace-controller.svelte'

  let { data, children }: { data: WorkspaceRouteData; children: Snippet } =
    $props()

  const workspace = new WorkspaceController({
    getRouteData: () => data,
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

  let activeWorkspace = $derived(
    workspace.workspaces.find(({ id }) => id === workspace.workspaceId) ?? null,
  )

  function selectWorkspace(workspaceId: string) {
    void goto(resolve('/(app)/workspaces/[workspaceId]', { workspaceId }))
  }
</script>

{#if workspace.state === 'error'}
  <main class="mx-auto min-h-screen max-w-md p-6">
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Workspace unavailable</Alert.Title>
      <Alert.Description>{workspace.message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={() => workspace.refresh()}
        >Try again</Button
      >
    </Alert.Root>
  </main>
{:else}
  <Sidebar.Provider style="--sidebar-width: 17rem;">
    <DashboardSidebar
      workspaces={workspace.workspaces}
      workspaceId={workspace.workspaceId}
      accounts={ledger.accounts}
      selectedId={ledger.selectedId}
      onworkspace={selectWorkspace}
      onnewaccount={ledger.newAccount}
    />
    <Sidebar.Inset class="min-w-0 overflow-hidden">
      <header
        class="flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur"
      >
        <Sidebar.Trigger />
        <Separator orientation="vertical" class="h-4" />
        <div class="flex min-w-0 items-center gap-2 text-sm">
          <span class="hidden text-muted-foreground sm:inline">Dukat</span>
          {#if activeWorkspace}
            <span class="hidden text-muted-foreground sm:inline">/</span>
            <span class="hidden truncate text-muted-foreground sm:inline">
              {activeWorkspace.name}
            </span>
          {/if}
        </div>
        {#if workspace.workspaces.length > 0}
          <Button
            class="ml-auto hidden sm:inline-flex"
            size="sm"
            onclick={ledger.newAccount}>New account</Button
          >
        {/if}
      </header>

      <div
        class="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 md:p-6 lg:p-8"
      >
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
                  onclick={() => ledger.retryCorrection()}
                  >Retry correction</Button
                >
                <Button
                  variant="outline"
                  disabled={ledger.pending}
                  onclick={ledger.abandonCorrection}
                  >Dismiss correction retry</Button
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

        {#if workspace.workspaces.length === 0}
          <Empty.Root class="rounded-xl border bg-card">
            <Empty.Header>
              <Empty.Title>No workspace</Empty.Title>
              <Empty.Description>
                Return home to choose or create a workspace.
              </Empty.Description>
            </Empty.Header>
            <Empty.Content>
              <Button href={resolve('/home')}>Go home</Button>
            </Empty.Content>
          </Empty.Root>
        {:else}
          {@render children()}
        {/if}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
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
