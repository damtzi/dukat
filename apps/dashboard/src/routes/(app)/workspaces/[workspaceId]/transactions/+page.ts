import type { Transaction } from '@dukat/core/ledger'
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
    return { filters, searchError: '', transactions: [] as Transaction[] }

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
    const transactions = (await loadApi(
      fetch,
      `/workspaces/${params.workspaceId}/transactions?${query}`,
    )) as Transaction[]
    return { filters, searchError: '', transactions }
  } catch (error) {
    return {
      filters,
      searchError: (error as Error).message,
      transactions: [] as Transaction[],
    }
  }
}
