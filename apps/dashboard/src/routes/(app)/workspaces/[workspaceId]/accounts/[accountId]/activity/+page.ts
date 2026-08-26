import type { Transaction, Transfer } from '@dukat/core/ledger'
import { loadApi, workspaceDataDependency } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ depends, fetch, params, parent }) => {
  depends(workspaceDataDependency)
  const parentData = await parent()
  if (parentData.state !== 'ready')
    return {
      activityError: '',
      transactions: [] as Transaction[],
      transfers: [] as Transfer[],
    }
  const base = `/workspaces/${params.workspaceId}/accounts/${params.accountId}`
  try {
    const [transactions, transfers] = await Promise.all([
      loadApi(fetch, `${base}/transactions?includeTrashed=true`) as Promise<
        Transaction[]
      >,
      loadApi(fetch, `${base}/transfers?includeTrashed=true`) as Promise<
        Transfer[]
      >,
    ])
    return { activityError: '', transactions, transfers }
  } catch (error) {
    return {
      activityError: (error as Error).message,
      transactions: [] as Transaction[],
      transfers: [] as Transfer[],
    }
  }
}
