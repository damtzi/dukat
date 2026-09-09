import { historyEntrySchema, type HistoryEntry } from '@dukat/core/ledger'
import { z } from 'zod'
import { apiJson } from '../workspace-controller.svelte'
import type { LedgerRuntime } from './runtime.svelte'

type HistoryEntity =
  | 'accounts'
  | 'transactions'
  | 'transfers'
  | 'balance-checks'
  | 'corrections'

export function createHistoryWorkflow(runtime: LedgerRuntime) {
  const state = $state({
    open: false,
    title: '',
    entries: [] as HistoryEntry[],
  })

  async function show(entity: HistoryEntity, id: string, title: string) {
    const workspaceId = runtime.callbacks.getWorkspaceId()
    state.title = title
    state.entries = []
    state.open = true
    try {
      const entries = await apiJson(
        `/workspaces/${workspaceId}/${entity}/${id}/history`,
        z.array(historyEntrySchema),
      )
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        state.entries = entries
    } catch (error) {
      if (runtime.callbacks.getWorkspaceId() === workspaceId) {
        runtime.message = (error as Error).message
        state.open = false
      }
    }
  }

  function changed(entry: HistoryEntry) {
    const before = entry.beforeJson ? JSON.parse(entry.beforeJson) : null
    const after = entry.afterJson ? JSON.parse(entry.afterJson) : null
    if (!before) return after ? `Created: ${JSON.stringify(after)}` : '—'
    if (!after) return `Removed: ${JSON.stringify(before)}`
    return (
      Object.keys({ ...before, ...after })
        .filter(
          (field) =>
            JSON.stringify(before[field]) !== JSON.stringify(after[field]),
        )
        .map(
          (field) =>
            `${field}: ${JSON.stringify(before[field])} → ${JSON.stringify(after[field])}`,
        )
        .join('; ') || 'No field changes'
    )
  }

  return {
    dialog: {
      get open() {
        return state.open
      },
      set open(value) {
        state.open = value
      },
      get title() {
        return state.title
      },
      get entries() {
        return state.entries
      },
    },
    show,
    changed,
  }
}
