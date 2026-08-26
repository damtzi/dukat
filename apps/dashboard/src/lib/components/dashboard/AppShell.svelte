<script lang="ts">
  import { Separator, Sidebar } from '@dukat/ui'
  import type { Snippet } from 'svelte'
  import AppSidebar from '$lib/components/dashboard/AppSidebar.svelte'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
  import type { Favorite } from '$lib/favorites'

  let {
    workspaces,
    favorites,
    favoritesError,
    children,
  }: {
    workspaces: Workspace[]
    favorites: Favorite[]
    favoritesError: string
    children: Snippet
  } = $props()
</script>

<Sidebar.Provider style="--sidebar-width: 17rem;">
  <AppSidebar {workspaces} {favorites} {favoritesError} />
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
