import { createAccountWorkflow } from './ledger-workflows/accounts.svelte'
import { createHistoryWorkflow } from './ledger-workflows/history.svelte'
import { createReconciliationWorkflow } from './ledger-workflows/reconciliation.svelte'
import {
  createLedgerRuntime,
  type LedgerCallbacks,
} from './ledger-workflows/runtime.svelte'
import { createTransactionWorkflow } from './ledger-workflows/transactions.svelte'
import { createTransferWorkflow } from './ledger-workflows/transfers.svelte'

export type { LedgerCallbacks }

export function createLedgerController(callbacks: LedgerCallbacks) {
  const runtime = createLedgerRuntime(callbacks)

  return {
    status: {
      get pending() {
        return runtime.pending
      },
      get message() {
        return runtime.message
      },
    },
    account: createAccountWorkflow(runtime),
    transaction: createTransactionWorkflow(runtime),
    transfer: createTransferWorkflow(runtime),
    reconciliation: createReconciliationWorkflow(runtime),
    history: createHistoryWorkflow(runtime),
  }
}
