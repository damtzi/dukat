import {
  householdExpenseSchema,
  settlementBalanceSchema,
  settlementPaymentSchema,
  transactionSchema,
  type HouseholdExpense,
  type SettlementBalance,
  type SettlementPayment,
  type Transaction,
} from '@dukat/core/ledger'
import { loadApiJson, workspaceDataDependency } from '$lib/api'
import { parseAmount } from '$lib/money'
import type { PageLoad } from './$types'
import { z } from 'zod'

export const load: PageLoad = async ({
  depends,
  fetch,
  params,
  parent,
  url,
}) => {
  depends(workspaceDataDependency)
  const parentData = await parent()
  const filters = {
    query: url.searchParams.get('query') ?? '',
    accountId: url.searchParams.get('accountId') ?? '',
    categoryId: url.searchParams.get('categoryId') ?? '',
    amountMin: url.searchParams.get('amountMin') ?? '',
    amountMax: url.searchParams.get('amountMax') ?? '',
    dateFrom: url.searchParams.get('dateFrom') ?? '',
    dateTo: url.searchParams.get('dateTo') ?? '',
    includeTrashed: url.searchParams.get('includeTrashed') === 'true',
  }
  if (parentData.state !== 'ready')
    return {
      filters,
      searchError: '',
      transactions: [] as Transaction[],
      householdExpenses: [] as HouseholdExpense[],
      settlementBalances: [] as SettlementBalance[],
      settlementPayments: [] as SettlementPayment[],
      isHousehold: false,
    }

  try {
    const query = new URLSearchParams({ limit: '200' })
    for (const key of [
      'query',
      'accountId',
      'categoryId',
      'dateFrom',
      'dateTo',
    ] as const)
      if (filters[key]) query.set(key, filters[key])
    if (filters.includeTrashed) query.set('includeTrashed', 'true')
    if (filters.amountMin || filters.amountMax) {
      const account = parentData.accounts.find(
        ({ id }) => id === filters.accountId,
      )
      if (!account) throw new Error('Select an account to filter by amount.')
      if (filters.amountMin)
        query.set(
          'amountMinMinor',
          parseAmount(filters.amountMin, account.currency),
        )
      if (filters.amountMax)
        query.set(
          'amountMaxMinor',
          parseAmount(filters.amountMax, account.currency),
        )
    }
    const isHousehold =
      parentData.workspaces.find(({ id }) => id === params.workspaceId)
        ?.type === 'household'
    const [
      transactions,
      householdExpenses,
      settlementBalances,
      settlementPayments,
    ] = await Promise.all([
      loadApiJson(
        fetch,
        `/workspaces/${params.workspaceId}/transactions?${query}`,
        z.array(transactionSchema),
      ),
      isHousehold
        ? loadApiJson(
            fetch,
            `/workspaces/${params.workspaceId}/household-expenses${filters.includeTrashed ? '?includeTrashed=true' : ''}`,
            z.array(householdExpenseSchema),
          )
        : Promise.resolve([]),
      isHousehold
        ? loadApiJson(
            fetch,
            `/workspaces/${params.workspaceId}/settlement-balances`,
            z.array(settlementBalanceSchema),
          )
        : Promise.resolve([]),
      isHousehold
        ? loadApiJson(
            fetch,
            `/workspaces/${params.workspaceId}/settlement-payments${filters.includeTrashed ? '?includeTrashed=true' : ''}`,
            z.array(settlementPaymentSchema),
          )
        : Promise.resolve([]),
    ])
    return {
      filters,
      searchError: '',
      transactions,
      householdExpenses,
      settlementBalances,
      settlementPayments,
      isHousehold,
    }
  } catch (error) {
    return {
      filters,
      searchError: (error as Error).message,
      transactions: [] as Transaction[],
      householdExpenses: [] as HouseholdExpense[],
      settlementBalances: [] as SettlementBalance[],
      settlementPayments: [] as SettlementPayment[],
      isHousehold: false,
    }
  }
}
