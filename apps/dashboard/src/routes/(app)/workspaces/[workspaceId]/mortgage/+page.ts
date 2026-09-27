import { loadApi, workspaceDataDependency } from '$lib/api'
import type { Mortgage, MortgagePayment } from '@dukat/core/mortgage'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ depends, fetch, params, parent }) => {
  depends(workspaceDataDependency)
  const workspace = await parent()
  if (workspace.state !== 'ready') return { mortgage: null }
  return {
    mortgage: (await loadApi(
      fetch,
      `/workspaces/${params.workspaceId}/mortgage`,
    )) as (Mortgage & { schedule: MortgagePayment[] }) | null,
  }
}
