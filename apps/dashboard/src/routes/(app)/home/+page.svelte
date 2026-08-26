<script lang="ts">
  import { onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Empty } from '@dukat/ui'
  import {
    api,
    type Workspace,
  } from '$lib/controllers/workspace-controller.svelte'

  let homeState = $state<'loading' | 'ready' | 'error'>('loading')
  let message = $state('')
  let workspaces = $state.raw<Workspace[]>([])
  let personal = $derived(workspaces.filter(({ type }) => type === 'personal'))
  let shared = $derived(workspaces.filter(({ type }) => type === 'household'))

  async function load() {
    homeState = 'loading'
    message = ''
    try {
      workspaces = (await api('/workspaces')) as Workspace[]
      homeState = 'ready'
    } catch (error) {
      message = (error as Error).message
      homeState = 'error'
    }
  }

  onMount(load)
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

<main
  class="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 p-4 md:p-8"
>
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-primary">Dukat</p>
      <h1 class="text-3xl font-semibold tracking-tight">Home</h1>
      <p class="mt-1 text-muted-foreground">
        Open your private or shared financial workspace.
      </p>
    </div>
    <nav class="flex flex-wrap gap-2" aria-label="Account navigation">
      <Button href={resolve('/workspaces/new')}>New shared workspace</Button>
      <Button href={resolve('/settings')} variant="outline">Settings</Button>
      <Button href={resolve('/profile')} variant="outline">Profile</Button>
    </nav>
  </header>

  {#if homeState === 'loading'}
    <p aria-live="polite">Loading your workspaces…</p>
  {:else if homeState === 'error'}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Home unavailable</Alert.Title>
      <Alert.Description>{message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={load}>Try again</Button>
    </Alert.Root>
  {:else if workspaces.length === 0}
    <Empty.Root class="rounded-xl border bg-card">
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
</main>
