import type { BalanceCheck, Correction } from '@dukat/core/ledger'
import { loadApi, workspaceDataDependency } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ depends, fetch, params, parent }) => {
  depends(workspaceDataDependency)
  const parentData = await parent()
  if (parentData.state !== 'ready')
    return {
      reconciliationError: '',
      checks: [] as BalanceCheck[],
      corrections: [] as Correction[],
    }
  const base = `/workspaces/${params.workspaceId}/accounts/${params.accountId}`
  try {
    const [checks, corrections] = await Promise.all([
      loadApi(fetch, `${base}/balance-checks?includeTrashed=true`) as Promise<
        BalanceCheck[]
      >,
      loadApi(fetch, `${base}/corrections?includeTrashed=true`) as Promise<
        Correction[]
      >,
    ])
    return { reconciliationError: '', checks, corrections }
  } catch (error) {
    return {
      reconciliationError: (error as Error).message,
      checks: [] as BalanceCheck[],
      corrections: [] as Correction[],
    }
  }
}
