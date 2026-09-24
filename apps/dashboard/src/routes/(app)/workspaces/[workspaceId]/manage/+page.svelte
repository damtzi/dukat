<script lang="ts">
  import { goto, invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Button, Card } from '@dukat/ui'
  import ArrowLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRight'
  import FileUpIcon from 'phosphor-svelte/lib/FileArrowUp'
  import SettingsIcon from 'phosphor-svelte/lib/GearSix'
  import TagIcon from 'phosphor-svelte/lib/Tag'
  import { workspacesDataDependency } from '$lib/api'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import WorkspaceSettings from '$lib/components/workspaces/workspace-settings.svelte'

  const { workspace } = getWorkspaceDashboardContext()
  let activeWorkspace = $derived(workspace.activeWorkspace)
  let workspaceId = $derived(workspace.workspaceId)
  let categoriesPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/categories', { workspaceId }),
  )
  let importsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/imports', { workspaceId }),
  )
  let ratesPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/rates', { workspaceId }),
  )

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
    title="Manage"
    description="Workspace tools and settings that you need less often."
  />

  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Card.Root>
      <Card.Header>
        <Card.Title>Categories</Card.Title>
        <Card.Description>
          Organize expenses with workspace-specific labels.
        </Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button href={categoriesPath} variant="outline">
          <TagIcon data-icon="inline-start" aria-hidden="true" />
          Open categories
        </Button>
      </Card.Footer>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>Import</Card.Title>
        <Card.Description>
          Add transactions in bulk from a CSV file.
        </Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button href={importsPath} variant="outline">
          <FileUpIcon data-icon="inline-start" aria-hidden="true" />
          Open import
        </Button>
      </Card.Footer>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>Exchange rates</Card.Title>
        <Card.Description>
          Review conversion status and manage manual rates.
        </Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button href={ratesPath} variant="outline">
          <ArrowLeftRightIcon data-icon="inline-start" aria-hidden="true" />
          Open rates
        </Button>
      </Card.Footer>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>
          {activeWorkspace?.type === 'household'
            ? 'Workspace settings'
            : 'Personal workspace'}
        </Card.Title>
        <Card.Description>
          {activeWorkspace?.type === 'household'
            ? 'Manage members, details, invitations, and ownership.'
            : 'Review this private workspace and its reporting currency.'}
        </Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button href="#workspace-settings" variant="outline">
          <SettingsIcon data-icon="inline-start" aria-hidden="true" />
          Open settings
        </Button>
      </Card.Footer>
    </Card.Root>
  </div>

  <div id="workspace-settings" class="scroll-mt-6">
    {#if activeWorkspace?.type === 'household'}
      {#key activeWorkspace.id}
        <WorkspaceSettings
          workspace={activeWorkspace}
          onchanged={() => invalidate(workspacesDataDependency)}
          onremoved={leaveWorkspace}
        />
      {/key}
    {:else}
      <Card.Root>
        <Card.Header>
          <Card.Title>Personal workspace details</Card.Title>
          <Card.Description>
            Personal workspaces are private and have no members or sharing
            controls.
          </Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs text-muted-foreground">Workspace</p>
            <p class="font-medium">{activeWorkspace?.name ?? 'Personal'}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Reporting currency</p>
            <p class="font-medium">
              {activeWorkspace?.reportingCurrency ?? 'Not set'}
            </p>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
</section>
