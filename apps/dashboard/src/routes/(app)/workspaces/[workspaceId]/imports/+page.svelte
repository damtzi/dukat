<script lang="ts">
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import CsvImports from '$lib/components/insights/CsvImports.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'

  const { ledger, workspace } = getWorkspaceDashboardContext()
</script>

<svelte:head><title>CSV imports · Dukat</title></svelte:head>

<section aria-labelledby="imports-title">
  <div class="mb-6">
    <h1 id="imports-title" class="text-3xl font-semibold tracking-tight">
      CSV imports
    </h1>
    <p class="mt-1 text-muted-foreground">
      Review bank data before adding it to an account.
    </p>
  </div>
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
