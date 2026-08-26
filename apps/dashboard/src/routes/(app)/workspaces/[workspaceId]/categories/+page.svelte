<script lang="ts">
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import CategoryManager from '$lib/components/insights/CategoryManager.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'

  const { ledger, workspace } = getWorkspaceDashboardContext()
</script>

<svelte:head><title>Categories · Dukat</title></svelte:head>

<section aria-labelledby="categories-title">
  <div class="mb-6">
    <h1 id="categories-title" class="text-3xl font-semibold tracking-tight">
      Categories
    </h1>
    <p class="mt-1 text-muted-foreground">
      Organize income and spending across this workspace.
    </p>
  </div>
  {#key workspace.workspaceId}
    <CategoryManager
      categories={ledger.categories}
      api={(path, options) =>
        api(`/workspaces/${workspace.workspaceId}/categories${path}`, options)}
      onchanged={() => workspace.refresh()}
    />
  {/key}
</section>
