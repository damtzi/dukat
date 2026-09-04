import type {
  HouseholdExpense,
  SettlementBalance,
  SettlementPayment,
  Transaction,
} from '@dukat/core/ledger'
import { loadApi, workspaceDataDependency } from '$lib/api'
import { parseAmount } from '$lib/money'
import type { PageLoad } from './$types'

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
      loadApi(
        fetch,
        `/workspaces/${params.workspaceId}/transactions?${query}`,
      ) as Promise<Transaction[]>,
      isHousehold
        ? (loadApi(
            fetch,
            `/workspaces/${params.workspaceId}/household-expenses${filters.includeTrashed ? '?includeTrashed=true' : ''}`,
          ) as Promise<HouseholdExpense[]>)
        : Promise.resolve([]),
      isHousehold
        ? (loadApi(
            fetch,
            `/workspaces/${params.workspaceId}/settlement-balances`,
          ) as Promise<SettlementBalance[]>)
        : Promise.resolve([]),
      isHousehold
        ? (loadApi(
            fetch,
            `/workspaces/${params.workspaceId}/settlement-payments${filters.includeTrashed ? '?includeTrashed=true' : ''}`,
          ) as Promise<SettlementPayment[]>)
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
