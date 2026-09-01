<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Account } from '@dukat/core/ledger'
  import { Collapsible, Sidebar } from '@dukat/ui'
  import MinusIcon from 'phosphor-svelte/lib/Minus'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import SharedIcon from 'phosphor-svelte/lib/UsersThree'
  import WorkspaceNavigation from '$lib/components/dashboard/workspace-navigation.svelte'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
  import type { Favorite } from '$lib/favorites'

  let {
    workspace,
    accounts,
    active,
    favorites,
    pendingFavoritePath,
    ontogglefavorite,
  }: {
    workspace: Workspace
    accounts: Account[]
    active: boolean
    favorites: Favorite[]
    pendingFavoritePath: string
    ontogglefavorite: (path: string, label: string) => void
  } = $props()

  const sidebar = Sidebar.useSidebar()
  let open = $derived(active)
  let overviewActive = $derived(
    active && page.route.id === '/(app)/workspaces/[workspaceId]',
  )
  let overviewPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]', {
      workspaceId: workspace.id,
    }),
  )

  function closeMobile() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }
</script>

<Collapsible.Root bind:open>
  {#snippet child({ props })}
    <Sidebar.MenuItem {...props}>
      <Sidebar.MenuButton
        class="pr-8"
        isActive={active}
        tooltipContent={workspace.name}
      >
        {#snippet child({ props })}
          <a
            {...props}
            href={overviewPath}
            aria-current={overviewActive ? 'page' : undefined}
            onclick={closeMobile}
          >
            <SharedIcon aria-hidden="true" />
            <span>{workspace.name}</span>
          </a>
        {/snippet}
      </Sidebar.MenuButton>
      <Collapsible.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuAction
            {...props}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${workspace.name}`}
            title={`${open ? 'Collapse' : 'Expand'} ${workspace.name}`}
          >
            {#if open}
              <MinusIcon aria-hidden="true" />
            {:else}
              <PlusIcon aria-hidden="true" />
            {/if}
          </Sidebar.MenuAction>
        {/snippet}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class="ml-3 border-l border-sidebar-border pl-2">
          <WorkspaceNavigation
            {workspace}
            {accounts}
            {favorites}
            {pendingFavoritePath}
            {ontogglefavorite}
          />
        </div>
      </Collapsible.Content>
    </Sidebar.MenuItem>
  {/snippet}
</Collapsible.Root>
