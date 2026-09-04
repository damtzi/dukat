<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button } from '@dukat/ui'
  import { workspaceDataDependency } from '$lib/api'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import TransactionsSection from '$lib/components/ledger/transactions-section.svelte'
  import TransfersSection from '$lib/components/ledger/transfers-section.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const { ledger } = getWorkspaceDashboardContext()
  let account = $derived(ledger.selected())
</script>

{#if account}
  {#if data.activityError}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Account activity unavailable</Alert.Title>
      <Alert.Description>{data.activityError}</Alert.Description>
      <Button
        class="mt-3"
        variant="outline"
        onclick={() => invalidate(workspaceDataDependency)}>Try again</Button
      >
    </Alert.Root>
  {:else}
    <div class="flex flex-col gap-8">
      <TransactionsSection
        {account}
        transactions={data.transactions}
        pending={ledger.pending}
        onnew={() => ledger.newTransaction(account.id)}
        onedit={ledger.editTransaction}
        onrefund={ledger.newRefund}
        onaction={ledger.transactionAction}
        onhistory={(item) =>
          ledger.showHistory('transactions', item.id, 'Transaction history')}
      />
      <TransfersSection
        {account}
        transfers={data.transfers}
        pending={ledger.pending}
        canCreate={!ledger.feeIntent}
        onnew={ledger.newTransfer}
        onedit={(item) =>
          ledger.editTransfer(item, () =>
            data.transfers.some(({ id }) => id === item.id),
          )}
        onaction={(item, action) =>
          ledger.entityAction('transfers', item, action)}
        onhistory={(item) =>
          ledger.showHistory('transfers', item.id, 'Transfer history')}
      />
    </div>
  {/if}
{/if}
