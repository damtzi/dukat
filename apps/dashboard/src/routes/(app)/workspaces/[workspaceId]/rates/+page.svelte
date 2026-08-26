<script lang="ts">
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import ManualRateManager from '$lib/components/workspaces/ManualRateManager.svelte'

  const { workspace } = getWorkspaceDashboardContext()
</script>

<svelte:head><title>Exchange rates · Dukat</title></svelte:head>

<section aria-labelledby="rates-title">
  <div class="mb-6">
    <h1 id="rates-title" class="text-3xl font-semibold tracking-tight">
      Exchange rates
    </h1>
    <p class="mt-1 text-muted-foreground">
      Control how foreign balances convert into the reporting currency.
    </p>
  </div>
  <ManualRateManager
    workspaceId={workspace.workspaceId}
    onchanged={() => workspace.refresh()}
  />
</section>
