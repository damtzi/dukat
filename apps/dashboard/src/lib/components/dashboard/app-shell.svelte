<script lang="ts">
  import type { Account } from '@dukat/core/ledger'
  import { Separator, Sidebar } from '@dukat/ui'
  import type { Snippet } from 'svelte'
  import AppSidebar from '$lib/components/dashboard/app-sidebar.svelte'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
  import type { Favorite } from '$lib/favorites'
  import type { SessionUser } from '$lib/session'

  let {
    user,
    workspaces,
    personalAccounts,
    favorites,
    favoritesError,
    children,
  }: {
    user: SessionUser
    workspaces: Workspace[]
    personalAccounts: Account[]
    favorites: Favorite[]
    favoritesError: string
    children: Snippet
  } = $props()
</script>

<Sidebar.Provider style="--sidebar-width: 17rem;">
  <AppSidebar
    {user}
    {workspaces}
    {personalAccounts}
    {favorites}
    {favoritesError}
  />
  <Sidebar.Inset class="min-w-0 overflow-hidden">
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur"
    >
      <Sidebar.Trigger />
      <Separator orientation="vertical" class="h-4" />
      <span class="text-sm font-medium">Dukat</span>
    </header>

    <div
      class="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 md:p-6 lg:p-8"
    >
      {@render children()}
    </div>
  </Sidebar.Inset>
</Sidebar.Provider>
