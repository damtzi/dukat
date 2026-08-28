import { loadApi, workspaceDataDependency } from '$lib/api'
import type { WorkspaceForecast } from '$lib/controllers/workspace-controller.svelte'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ depends, fetch, params, parent }) => {
  depends(workspaceDataDependency)
  const parentData = await parent()
  if (parentData.state !== 'ready')
    return { tentativeForecast: null as WorkspaceForecast | null }

  const tentativeForecast = await (
    loadApi(
      fetch,
      `/workspaces/${params.workspaceId}/forecast?includeTentative=true`,
    ) as Promise<WorkspaceForecast>
  ).catch(() => null)

  return { tentativeForecast }
}
