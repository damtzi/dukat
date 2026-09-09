<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button } from '@dukat/ui'
  import { workspaceDataDependency } from '$lib/api'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import ReconciliationSection from '$lib/components/ledger/reconciliation-section.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const { ledger } = getWorkspaceDashboardContext()
  let account = $derived(ledger.account.selected())
</script>

{#if account}
  {#if data.reconciliationError}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Reconciliation unavailable</Alert.Title>
      <Alert.Description>{data.reconciliationError}</Alert.Description>
      <Button
        class="mt-3"
        variant="outline"
        onclick={() => invalidate(workspaceDataDependency)}>Try again</Button
      >
    </Alert.Root>
  {:else}
    <ReconciliationSection
      {account}
      checks={data.checks}
      corrections={data.corrections}
      pending={ledger.status.pending}
      onnew={ledger.reconciliation.create}
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
{/if}
