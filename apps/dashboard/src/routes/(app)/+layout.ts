import { accountSchema, type Account } from '@dukat/core/ledger'
import { z } from 'zod'
import {
  loadApi,
  loadApiJson,
  workspaceDataDependency,
  workspacesDataDependency,
} from '$lib/api'
import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
import type { LayoutLoad } from './$types'

export const prerender = false

export const load: LayoutLoad = async ({ depends, fetch }) => {
  depends(workspacesDataDependency)
  depends(workspaceDataDependency)
  const [workspacesResult] = await Promise.allSettled([
    loadApi(fetch, '/workspaces') as Promise<Workspace[]>,
  ])

  let personalAccounts: Account[] = []
  let personalAccountsError = ''
  if (workspacesResult.status === 'fulfilled') {
    const personalWorkspace = workspacesResult.value.find(
      ({ type }) => type === 'personal',
    )
    if (personalWorkspace) {
      try {
        personalAccounts = await loadApiJson(
          fetch,
          `/workspaces/${personalWorkspace.id}/accounts`,
          z.array(accountSchema),
        )
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
  }
}
