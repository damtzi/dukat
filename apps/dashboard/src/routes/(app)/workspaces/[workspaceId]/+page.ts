import { loadApi, workspaceDataDependency } from '$lib/api'
import type { CashFlow } from '@dukat/core/csv-import'
import type { WorkspaceForecast } from '$lib/controllers/workspace-controller.svelte'
import {
  cashFlowRange,
  equivalentCashFlowRange,
  todayInWarsaw,
} from '$lib/date'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ depends, fetch, params, parent }) => {
  depends(workspaceDataDependency)
  const cashFlowCurrentRange = cashFlowRange('month', todayInWarsaw())
  const cashFlowPreviousRange = equivalentCashFlowRange(
    cashFlowCurrentRange,
    'month',
  )
  const parentData = await parent()
  if (parentData.state !== 'ready')
    return {
      tentativeForecast: null as WorkspaceForecast | null,
      cashFlowCurrent: null as CashFlow | null,
      cashFlowPrevious: null as CashFlow | null,
      cashFlowCurrentRange,
      cashFlowPreviousRange,
    }

  const requestCashFlow = (range: { startDate: string; endDate: string }) =>
    loadApi(
      fetch,
      `/workspaces/${params.workspaceId}/cash-flow?startDate=${range.startDate}&endDate=${range.endDate}`,
    ) as Promise<CashFlow>
  const [tentativeForecast, cashFlowCurrent, cashFlowPrevious] =
    await Promise.all([
      (
        loadApi(
          fetch,
          `/workspaces/${params.workspaceId}/forecast?includeTentative=true`,
        ) as Promise<WorkspaceForecast>
      ).catch(() => null),
      requestCashFlow(cashFlowCurrentRange).catch(() => null),
      requestCashFlow(cashFlowPreviousRange).catch(() => null),
    ])

  return {
    tentativeForecast,
    cashFlowCurrent,
    cashFlowPrevious,
    cashFlowCurrentRange,
    cashFlowPreviousRange,
  }
}
