import { redirect } from '@sveltejs/kit'
import { resolve } from '$app/paths'
import type { Account } from '@dukat/core/ledger'
import type { Category } from '@dukat/core/csv-import'
import { loadApi, workspaceDataDependency } from '$lib/api'
import type {
  ConvertedBalances,
  HouseholdMember,
  RateStatus,
  WorkspaceForecast,
  WorkspaceRouteData,
} from '$lib/controllers/workspace-controller.svelte'
import type { LayoutLoad } from './$types'

function failed(workspaceId: string, message: string): WorkspaceRouteData {
  return {
    state: 'error',
    message,
    workspaceId,
    accounts: [],
    categories: [],
    members: [],
    selectedAccountId: '',
    rateStatus: null,
    convertedBalances: null,
    workspaceForecast: null,
  }
}

export const load: LayoutLoad = async ({ depends, fetch, params, parent }) => {
  depends(workspaceDataDependency)
  const workspaceId = params.workspaceId
  const {
    workspaces,
    workspacesError,
    personalAccounts,
    personalAccountsError,
  } = await parent()
  if (workspacesError) return failed(workspaceId, workspacesError)

  if (!workspaces.some(({ id }) => id === workspaceId))
    redirect(307, resolve('/home'))

  const workspace = workspaces.find(({ id }) => id === workspaceId)!
  let accounts: Account[]
  let categories: Category[]
  let members: HouseholdMember[] = []
  try {
    if (workspace.type === 'personal' && personalAccountsError)
      throw new Error(personalAccountsError)
    ;[accounts, categories, members] = await Promise.all([
      workspace.type === 'personal'
        ? Promise.resolve(personalAccounts)
        : (loadApi(fetch, `/workspaces/${workspaceId}/accounts`) as Promise<
            Account[]
          >),
      loadApi(fetch, `/workspaces/${workspaceId}/categories`) as Promise<
        Category[]
      >,
      workspace.type === 'household'
        ? (loadApi(fetch, `/workspaces/${workspaceId}/members`) as Promise<
            HouseholdMember[]
          >)
        : Promise.resolve([]),
    ])
  } catch (error) {
    return failed(workspaceId, (error as Error).message)
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
    accounts,
    categories,
    members,
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
