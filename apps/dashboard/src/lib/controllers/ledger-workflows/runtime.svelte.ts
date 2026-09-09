import type { Account } from '@dukat/core/ledger'
import type {
  PickerAccount,
  WorkspaceRouteData,
} from '../workspace-controller.svelte'

export type LedgerCallbacks = {
  getWorkspaceId: () => string
  getPickerAccounts: () => PickerAccount[]
  loadPickerAccounts: () => Promise<void>
  reloadAccounts: () => Promise<void>
  getRouteData: () => WorkspaceRouteData
}

export function createLedgerRuntime(callbacks: LedgerCallbacks) {
  let pending = $state(false)
  let message = $state('')
  let actionIntent: { name: string; key: string; body?: string } | null = null

  return {
    callbacks,
    key: () => `${Date.now()}-${crypto.randomUUID()}`,
    selected: (): Account | undefined => {
      const data = callbacks.getRouteData()
      return data.accounts.find(
        (account) => account.id === data.selectedAccountId,
      )
    },
    get pending() {
      return pending
    },
    set pending(value) {
      pending = value
    },
    get message() {
      return message
    },
    set message(value) {
      message = value
    },
    actionIntent(name: string) {
      if (actionIntent?.name !== name) actionIntent = { name, key: this.key() }
      return actionIntent
    },
    clearActionIntent() {
      actionIntent = null
    },
  }
}

export type LedgerRuntime = ReturnType<typeof createLedgerRuntime>
