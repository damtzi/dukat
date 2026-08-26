import { loadApi, workspacesDataDependency } from '$lib/api'
import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
import type { LayoutLoad } from './$types'

export const prerender = false

export const load: LayoutLoad = async ({ depends, fetch }) => {
  depends(workspacesDataDependency)
  try {
    return {
      workspaces: (await loadApi(fetch, '/workspaces')) as Workspace[],
      workspacesError: '',
    }
  } catch (error) {
    return {
      workspaces: [] as Workspace[],
      workspacesError: (error as Error).message,
    }
  }
}
