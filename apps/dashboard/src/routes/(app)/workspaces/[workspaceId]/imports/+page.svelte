<script lang="ts">
  import PageHeader from '$lib/components/dashboard/PageHeader.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import CsvImports from '$lib/components/insights/CsvImports.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'

  const { ledger, workspace } = getWorkspaceDashboardContext()
</script>

<svelte:head><title>CSV imports · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="imports-title">
  <PageHeader
    id="imports-title"
    title="CSV imports"
    description="Review bank data before adding it to an account."
  />
  {#key workspace.workspaceId}
    <CsvImports
      accounts={ledger.accounts}
      categories={ledger.categories}
      api={(path, options) =>
        api(`/workspaces/${workspace.workspaceId}/imports${path}`, options)}
      onchanged={() => workspace.refresh()}
    />
  {/key}
</section>
