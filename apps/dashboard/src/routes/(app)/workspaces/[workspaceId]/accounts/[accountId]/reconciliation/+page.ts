import {
  balanceCheckSchema,
  correctionSchema,
  type BalanceCheck,
  type Correction,
} from '@dukat/core/ledger'
import { loadApiJson, workspaceDataDependency } from '$lib/api'
import type { PageLoad } from './$types'
import { z } from 'zod'

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
      loadApiJson(
        fetch,
        `${base}/balance-checks?includeTrashed=true`,
        z.array(balanceCheckSchema),
      ),
      loadApiJson(
        fetch,
        `${base}/corrections?includeTrashed=true`,
        z.array(correctionSchema),
      ),
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
