<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Empty } from '@dukat/ui'
  import { workspacesDataDependency } from '$lib/api'
  import PageHeader from '$lib/components/dashboard/PageHeader.svelte'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  let workspaces = $derived(data.workspaces)
  let personal = $derived(workspaces.filter(({ type }) => type === 'personal'))
  let shared = $derived(workspaces.filter(({ type }) => type === 'household'))
</script>

{#snippet WorkspaceList(title: string, items: Workspace[])}
  {#if items.length > 0}
    <section class="flex flex-col gap-3" aria-labelledby={`${title}-title`}>
      <h2
        id={`${title}-title`}
        class="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h2>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {#each items as workspace (workspace.id)}
          <Card.Root>
            <Card.Header>
              <Card.Title>{workspace.name}</Card.Title>
              <Card.Description>
                {workspace.type === 'personal'
                  ? 'Private to you'
                  : workspace.role === 'owner'
                    ? 'Shared · Owner'
                    : 'Shared · Member'}
              </Card.Description>
            </Card.Header>
            <Card.Footer>
              <Button
                href={resolve('/(app)/workspaces/[workspaceId]', {
                  workspaceId: workspace.id,
                })}
                variant="outline"
              >
                Open workspace
              </Button>
            </Card.Footer>
          </Card.Root>
        {/each}
      </div>
    </section>
  {/if}
{/snippet}

<svelte:head><title>Home · Dukat</title></svelte:head>

<div class="flex w-full flex-col gap-6">
  <PageHeader
    title="Home"
    description="Open your private or shared financial workspace."
  >
    {#snippet actions()}
      <Button href={resolve('/workspaces/new')}>New shared workspace</Button>
    {/snippet}
  </PageHeader>

  {#if data.workspacesError}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Home unavailable</Alert.Title>
      <Alert.Description>{data.workspacesError}</Alert.Description>
      <Button
        class="mt-3"
        variant="outline"
        onclick={() => invalidate(workspacesDataDependency)}>Try again</Button
      >
    </Alert.Root>
  {:else if workspaces.length === 0}
    <Empty.Root>
      <Empty.Header>
        <Empty.Title>No workspaces</Empty.Title>
        <Empty.Description>
          Create a shared workspace to start tracking finances.
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button href={resolve('/workspaces/new')}>Create workspace</Button>
      </Empty.Content>
    </Empty.Root>
  {:else}
    {@render WorkspaceList('Personal', personal)}
    {@render WorkspaceList('Shared', shared)}
  {/if}
</div>
