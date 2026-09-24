<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button } from '@dukat/ui'
  import { workspaceDataDependency } from '$lib/api'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import ReconciliationSection from '$lib/components/ledger/reconciliation-section.svelte'
  import TransactionsSection from '$lib/components/ledger/transactions-section.svelte'
  import TransfersSection from '$lib/components/ledger/transfers-section.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const { ledger } = getWorkspaceDashboardContext()
  let account = $derived(ledger.account.selected())
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
        pending={ledger.status.pending}
        onnew={() => ledger.transaction.create(account.id)}
        onedit={ledger.transaction.edit}
        onrefund={ledger.transaction.refund}
        onaction={ledger.transaction.action}
        onhistory={(item) =>
          ledger.history.show('transactions', item.id, 'Transaction history')}
      />
      <TransfersSection
        {account}
        transfers={data.transfers}
        pending={ledger.status.pending}
        canCreate={!ledger.transfer.feeIntent}
        onnew={ledger.transfer.create}
        onedit={(item) =>
          ledger.transfer.edit(item, () =>
            data.transfers.some(({ id }) => id === item.id),
          )}
        onaction={(item, action) => ledger.transfer.action(item, action)}
        onhistory={(item) =>
          ledger.history.show('transfers', item.id, 'Transfer history')}
      />
      {#if data.balanceHistoryError}
        <Alert.Root variant="destructive" role="alert">
          <Alert.Title>Balance history unavailable</Alert.Title>
          <Alert.Description>{data.balanceHistoryError}</Alert.Description>
          <Button
            class="mt-3"
            variant="outline"
            onclick={() => invalidate(workspaceDataDependency)}
            >Try again</Button
          >
        </Alert.Root>
      {:else}
        <ReconciliationSection
          {account}
          checks={data.checks}
          corrections={data.corrections}
          pending={ledger.status.pending}
          onedit={ledger.reconciliation.edit}
          oncorrect={ledger.reconciliation.createCorrection}
          oncheckaction={(item, action) =>
            ledger.reconciliation.action('balance-checks', item, action)}
          oncorrectionaction={(item, action) =>
            ledger.reconciliation.action('corrections', item, action)}
          oncheckhistory={(item) =>
            ledger.history.show(
              'balance-checks',
              item.id,
              'Balance snapshot history',
            )}
          oncorrectionhistory={(item) =>
            ledger.history.show('corrections', item.id, 'Correction history')}
        />
      {/if}
    </div>
  {/if}
{/if}
