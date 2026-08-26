import { loadApi, workspacesDataDependency } from '$lib/api'
import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
import { favoritesDataDependency, type Favorite } from '$lib/favorites'
import type { LayoutLoad } from './$types'

export const prerender = false

export const load: LayoutLoad = async ({ depends, fetch }) => {
  depends(workspacesDataDependency)
  depends(favoritesDataDependency)
  const [workspacesResult, favoritesResult] = await Promise.allSettled([
    loadApi(fetch, '/workspaces') as Promise<Workspace[]>,
    loadApi(fetch, '/favorites') as Promise<Favorite[]>,
  ])

  return {
    workspaces:
      workspacesResult.status === 'fulfilled' ? workspacesResult.value : [],
    workspacesError:
      workspacesResult.status === 'rejected'
        ? (workspacesResult.reason as Error).message
        : '',
    favorites:
      favoritesResult.status === 'fulfilled' ? favoritesResult.value : [],
    favoritesError:
      favoritesResult.status === 'rejected'
        ? (favoritesResult.reason as Error).message
        : '',
  }
}
