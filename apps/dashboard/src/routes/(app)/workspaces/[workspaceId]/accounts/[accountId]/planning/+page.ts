import { loadApi, workspaceDataDependency } from '$lib/api'
import type { Forecast, Plan } from '$lib/components/planning/planning-types'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({
  depends,
  fetch,
  params,
  parent,
  url,
}) => {
  depends(workspaceDataDependency)
  const includeTentative = url.searchParams.get('includeTentative') === 'true'
  const parentData = await parent()
  if (parentData.state !== 'ready')
    return {
      planningError: '',
      includeTentative,
      plans: [] as Plan[],
      forecast: null as Forecast | null,
    }
  try {
    const [plans, forecast] = await Promise.all([
      loadApi(fetch, `/workspaces/${params.workspaceId}/plans`) as Promise<
        Plan[]
      >,
      loadApi(
        fetch,
        `/workspaces/${params.workspaceId}/forecast?accountId=${encodeURIComponent(params.accountId)}&includeTentative=${includeTentative}`,
      ) as Promise<Forecast>,
    ])
    return {
      planningError: '',
      includeTentative,
      plans,
      forecast,
    }
  } catch (error) {
    return {
      planningError: (error as Error).message,
      includeTentative,
      plans: [] as Plan[],
      forecast: null as Forecast | null,
    }
  }
}
