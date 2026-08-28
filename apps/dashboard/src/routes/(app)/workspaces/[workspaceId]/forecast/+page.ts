import { loadApi, workspaceDataDependency } from '$lib/api'
import type { Plan } from '$lib/components/planning/planning-types'
import type { WorkspaceForecast } from '$lib/controllers/workspace-controller.svelte'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ depends, fetch, params, parent }) => {
  depends(workspaceDataDependency)
  const parentData = await parent()
  if (parentData.state !== 'ready')
    return {
      forecastError: parentData.message,
      plans: [] as Plan[],
      expected: null as WorkspaceForecast | null,
      tentative: null as WorkspaceForecast | null,
    }

  try {
    const [plans, expected, tentative] = await Promise.all([
      loadApi(fetch, `/workspaces/${params.workspaceId}/plans`) as Promise<
        Plan[]
      >,
      loadApi(
        fetch,
        `/workspaces/${params.workspaceId}/forecast?includeTentative=false`,
      ) as Promise<WorkspaceForecast>,
      loadApi(
        fetch,
        `/workspaces/${params.workspaceId}/forecast?includeTentative=true`,
      ) as Promise<WorkspaceForecast>,
    ])
    return { forecastError: '', plans, expected, tentative }
  } catch (error) {
    return {
      forecastError: (error as Error).message,
      plans: [] as Plan[],
      expected: null as WorkspaceForecast | null,
      tentative: null as WorkspaceForecast | null,
    }
  }
}
