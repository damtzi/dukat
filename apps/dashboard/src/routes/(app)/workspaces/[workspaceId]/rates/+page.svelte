<script lang="ts">
  import PageHeader from '$lib/components/dashboard/PageHeader.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import ManualRateManager from '$lib/components/workspaces/ManualRateManager.svelte'

  const { workspace } = getWorkspaceDashboardContext()
</script>

<svelte:head><title>Exchange rates · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="rates-title">
  <PageHeader
    id="rates-title"
    title="Exchange rates"
    description="Control how foreign balances convert into the reporting currency."
  />
  <ManualRateManager
    workspaceId={workspace.workspaceId}
    onchanged={() => workspace.refresh()}
  />
</section>
