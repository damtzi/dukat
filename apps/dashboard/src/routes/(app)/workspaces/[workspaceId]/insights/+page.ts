import type { WorkspaceBalanceHistoryPoint } from '@dukat/core/overview'
import { loadApi } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const parentData = await parent()
  if (parentData.state !== 'ready')
    return { balanceHistory: [] as WorkspaceBalanceHistoryPoint[] }

  const balanceHistory = await (
    loadApi(
      fetch,
      `/workspaces/${params.workspaceId}/balance-history`,
    ) as Promise<WorkspaceBalanceHistoryPoint[]>
  ).catch(() => [])

  return { balanceHistory }
}
