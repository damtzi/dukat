import { redirect } from '@sveltejs/kit'
import { resolve } from '$app/paths'
import type { Account } from '@dukat/core/ledger'
import type { Category } from '@dukat/core/csv-import'
import { loadApi, workspaceDataDependency } from '$lib/api'
import type {
  ConvertedBalances,
  RateStatus,
  Workspace,
  WorkspaceForecast,
  WorkspaceRouteData,
} from '$lib/controllers/workspace-controller.svelte'
import type { LayoutLoad } from './$types'

function failed(
  workspaceId: string,
  message: string,
  workspaces: Workspace[] = [],
): WorkspaceRouteData {
  return {
    state: 'error',
    message,
    workspaceId,
    workspaces,
    accounts: [],
    categories: [],
    selectedAccountId: '',
    rateStatus: null,
    convertedBalances: null,
    workspaceForecast: null,
  }
}

export const load: LayoutLoad = async ({ depends, fetch, params }) => {
  depends(workspaceDataDependency)
  const workspaceId = params.workspaceId

  let workspaces: Workspace[]
  try {
    workspaces = (await loadApi(fetch, '/workspaces')) as Workspace[]
  } catch (error) {
    return failed(workspaceId, (error as Error).message)
  }

  if (!workspaces.some(({ id }) => id === workspaceId))
    redirect(307, resolve('/home'))

  let accounts: Account[]
  let categories: Category[]
  try {
    ;[accounts, categories] = await Promise.all([
      loadApi(fetch, `/workspaces/${workspaceId}/accounts`) as Promise<
        Account[]
      >,
      loadApi(fetch, `/workspaces/${workspaceId}/categories`) as Promise<
        Category[]
      >,
    ])
  } catch (error) {
    return failed(workspaceId, (error as Error).message, workspaces)
  }

  const requestedAccountId = params.accountId ?? ''
  if (
    requestedAccountId &&
    !accounts.some(({ id }) => id === requestedAccountId)
  )
    redirect(
      307,
      resolve('/(app)/workspaces/[workspaceId]/accounts', { workspaceId }),
    )

  const [rateStatus, convertedBalances, workspaceForecast] = await Promise.all([
    (loadApi(fetch, '/rates/status') as Promise<RateStatus>).catch(() => null),
    (
      loadApi(
        fetch,
        `/workspaces/${workspaceId}/balances/converted`,
      ) as Promise<ConvertedBalances>
    ).catch(() => null),
    (
      loadApi(
        fetch,
        `/workspaces/${workspaceId}/forecast`,
      ) as Promise<WorkspaceForecast>
    ).catch(() => null),
  ])

  return {
    state: 'ready',
    message: '',
    workspaceId,
    workspaces,
    accounts,
    categories,
    selectedAccountId:
      requestedAccountId ||
      accounts.find(({ archivedAt }) => !archivedAt)?.id ||
      accounts[0]?.id ||
      '',
    rateStatus,
    convertedBalances,
    workspaceForecast,
  } satisfies WorkspaceRouteData
}
