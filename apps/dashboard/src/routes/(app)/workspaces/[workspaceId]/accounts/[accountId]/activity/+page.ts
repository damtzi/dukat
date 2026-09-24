import {
  balanceCheckSchema,
  correctionSchema,
  transactionSchema,
  transferSchema,
  type BalanceCheck,
  type Correction,
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
      balanceHistoryError: '',
      transactions: [] as Transaction[],
      transfers: [] as Transfer[],
      checks: [] as BalanceCheck[],
      corrections: [] as Correction[],
    }
  const base = `/workspaces/${params.workspaceId}/accounts/${params.accountId}`
  let activityError = ''
  let transactions: Transaction[] = []
  let transfers: Transfer[] = []
  try {
    const activity = await Promise.all([
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
    transactions = activity[0]
    transfers = activity[1]
  } catch (error) {
    activityError = (error as Error).message
  }
  let balanceHistoryError = ''
  let checks: BalanceCheck[] = []
  let corrections: Correction[] = []
  try {
    const balanceHistory = await Promise.all([
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
    checks = balanceHistory[0]
    corrections = balanceHistory[1]
  } catch (error) {
    balanceHistoryError = (error as Error).message
  }
  return {
    activityError,
    balanceHistoryError,
    transactions,
    transfers,
    checks,
    corrections,
  }
}
