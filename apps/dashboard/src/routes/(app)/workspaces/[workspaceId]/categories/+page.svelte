<script lang="ts">
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import CategoryManager from '$lib/components/insights/category-manager.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'

  const { ledger, workspace } = getWorkspaceDashboardContext()
</script>

<svelte:head><title>Categories · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="categories-title">
  <PageHeader
    id="categories-title"
    title="Categories"
    description="Organize income and spending across this workspace."
  />
  {#key workspace.workspaceId}
    <CategoryManager
      categories={ledger.categories}
      api={(path, options) =>
        api(`/workspaces/${workspace.workspaceId}/categories${path}`, options)}
      onchanged={() => workspace.refresh()}
    />
  {/key}
</section>
