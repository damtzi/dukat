import type { MyOverview } from '@dukat/core/overview'
import { loadApi, overviewDataDependency } from '$lib/api'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ depends, fetch }) => {
  depends(overviewDataDependency)
  try {
    return {
      overview: (await loadApi(fetch, '/overview')) as MyOverview,
      overviewError: '',
    }
  } catch (error) {
    return {
      overview: null,
      overviewError: (error as Error).message,
    }
  }
}
