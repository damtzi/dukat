import {
  transactionSchema,
  transferSchema,
  type Transaction,
  type Transfer,
} from '@dukat/core/ledger'
import { loadApiJson, workspaceDataDependency } from '$lib/api'
import type { PageLoad } from './$types'
import { z } from 'zod'

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
      loadApiJson(
        fetch,
        `${base}/transactions?includeTrashed=true`,
        z.array(transactionSchema),
      ),
      loadApiJson(
        fetch,
        `${base}/transfers?includeTrashed=true`,
        z.array(transferSchema),
      ),
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
