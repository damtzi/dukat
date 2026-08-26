<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Empty } from '@dukat/ui'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import WorkspaceSettings from '$lib/components/workspaces/WorkspaceSettings.svelte'

  const { workspace } = getWorkspaceDashboardContext()
  let activeWorkspace = $derived(
    workspace.workspaces.find(({ id }) => id === workspace.workspaceId) ?? null,
  )

  async function leaveWorkspace() {
    await goto(resolve('/home'), { replaceState: true })
  }
</script>

<svelte:head><title>Manage workspace · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="manage-title">
  <div>
    <h1 id="manage-title" class="text-3xl font-semibold tracking-tight">
      Manage workspace
    </h1>
    <p class="mt-1 text-muted-foreground">
      Manage collaboration and workspace details.
    </p>
  </div>

  {#if activeWorkspace?.type === 'household'}
    {#key activeWorkspace.id}
      <WorkspaceSettings
        workspace={activeWorkspace}
        onchanged={() => workspace.refresh()}
        onremoved={leaveWorkspace}
      />
    {/key}
  {:else}
    <Empty.Root class="rounded-xl border bg-card">
      <Empty.Header>
        <Empty.Title>Private workspace</Empty.Title>
        <Empty.Description>
          Personal workspaces have no members or sharing controls.
        </Empty.Description>
      </Empty.Header>
    </Empty.Root>
  {/if}
</section>
