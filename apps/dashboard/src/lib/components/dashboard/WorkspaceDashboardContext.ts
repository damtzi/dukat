import { createContext } from 'svelte'
import type { createLedgerController } from '$lib/controllers/ledger-controller.svelte'
import type { WorkspaceController } from '$lib/controllers/workspace-controller.svelte'

type WorkspaceDashboardContext = {
  ledger: ReturnType<typeof createLedgerController>
  workspace: WorkspaceController
}

export const [getWorkspaceDashboardContext, setWorkspaceDashboardContext] =
  createContext<WorkspaceDashboardContext>()
