<script lang="ts">
  import { goto, invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Empty } from '@dukat/ui'
  import { workspacesDataDependency } from '$lib/api'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import WorkspaceSettings from '$lib/components/workspaces/workspace-settings.svelte'

  const { workspace } = getWorkspaceDashboardContext()
  let activeWorkspace = $derived(workspace.activeWorkspace)

  async function leaveWorkspace() {
    await goto(resolve('/home'), {
      replaceState: true,
      invalidate: [workspacesDataDependency],
    })
  }
</script>

<svelte:head><title>Manage workspace · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="manage-title">
  <PageHeader
    id="manage-title"
    title="Manage workspace"
    description="Manage collaboration and workspace details."
  />

  {#if activeWorkspace?.type === 'household'}
    {#key activeWorkspace.id}
      <WorkspaceSettings
        workspace={activeWorkspace}
        onchanged={() => invalidate(workspacesDataDependency)}
        onremoved={leaveWorkspace}
      />
    {/key}
  {:else}
    <Empty.Root>
      <Empty.Header>
        <Empty.Title>Private workspace</Empty.Title>
        <Empty.Description>
          Personal workspaces have no members or sharing controls.
        </Empty.Description>
      </Empty.Header>
    </Empty.Root>
  {/if}
</section>
