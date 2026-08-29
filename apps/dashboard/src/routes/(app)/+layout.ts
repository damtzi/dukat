import type { Account } from '@dukat/core/ledger'
import {
  loadApi,
  workspaceDataDependency,
  workspacesDataDependency,
} from '$lib/api'
import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
import { favoritesDataDependency, type Favorite } from '$lib/favorites'
import type { LayoutLoad } from './$types'

export const prerender = false

export const load: LayoutLoad = async ({ depends, fetch }) => {
  depends(workspacesDataDependency)
  depends(workspaceDataDependency)
  depends(favoritesDataDependency)
  const [workspacesResult, favoritesResult] = await Promise.allSettled([
    loadApi(fetch, '/workspaces') as Promise<Workspace[]>,
    loadApi(fetch, '/favorites') as Promise<Favorite[]>,
  ])

  let personalAccounts: Account[] = []
  let personalAccountsError = ''
  if (workspacesResult.status === 'fulfilled') {
    const personalWorkspace = workspacesResult.value.find(
      ({ type }) => type === 'personal',
    )
    if (personalWorkspace) {
      try {
        personalAccounts = (await loadApi(
          fetch,
          `/workspaces/${personalWorkspace.id}/accounts`,
        )) as Account[]
      } catch (error) {
        personalAccountsError = (error as Error).message
      }
    }
  }

  return {
    workspaces:
      workspacesResult.status === 'fulfilled' ? workspacesResult.value : [],
    workspacesError:
      workspacesResult.status === 'rejected'
        ? (workspacesResult.reason as Error).message
        : '',
    personalAccounts,
    personalAccountsError,
    favorites:
      favoritesResult.status === 'fulfilled' ? favoritesResult.value : [],
    favoritesError:
      favoritesResult.status === 'rejected'
        ? (favoritesResult.reason as Error).message
        : '',
  }
}
