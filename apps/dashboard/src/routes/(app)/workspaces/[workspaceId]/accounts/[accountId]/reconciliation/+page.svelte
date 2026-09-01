<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button } from '@dukat/ui'
  import { workspaceDataDependency } from '$lib/api'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import ReconciliationSection from '$lib/components/ledger/reconciliation-section.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const { ledger } = getWorkspaceDashboardContext()
  let account = $derived(ledger.selected())
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
      pending={ledger.pending}
      onnew={ledger.newCheck}
      onedit={ledger.editCheck}
      oncorrect={ledger.createCorrection}
      oncheckaction={(item, action) =>
        ledger.entityAction('balance-checks', item, action)}
      oncorrectionaction={(item, action) =>
        ledger.entityAction('corrections', item, action)}
      oncheckhistory={(item) =>
        ledger.showHistory('balance-checks', item.id, 'Balance check history')}
      oncorrectionhistory={(item) =>
        ledger.showHistory('corrections', item.id, 'Correction history')}
    />
  {/if}
{/if}
