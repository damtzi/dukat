import type { Transfer } from '@dukat/core/ledger'
import { todayInWarsaw } from '$lib/date'
import { minorToDecimal, parseAmount } from '$lib/money'
import { api } from '../workspace-controller.svelte'
import type { LedgerRuntime } from './runtime.svelte'

type RetainedIntent = { path: string; body: string }

export function createTransferWorkflow(runtime: LedgerRuntime) {
  const state = $state({
    open: false,
    error: '',
    editing: null as Transfer | null,
    form: {
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      receivedAmount: '',
      date: todayInWarsaw(),
      description: '',
      fee: '',
      feeDescription: '',
    },
  })
  let intentKey = ''
  let dialogWorkspaceId = ''
  let feeIntents = $state.raw<Record<string, RetainedIntent>>({})

  const activeFeeIntent = (workspaceId = runtime.callbacks.getWorkspaceId()) =>
    feeIntents[workspaceId] ?? null

  function setActiveFeeIntent(
    value: RetainedIntent | null,
    workspaceId = runtime.callbacks.getWorkspaceId(),
  ) {
    if (!workspaceId) return
    const next = { ...feeIntents }
    if (value) next[workspaceId] = value
    else delete next[workspaceId]
    feeIntents = next
  }

  const destinations = (sourceId: string) =>
    runtime.callbacks
      .getPickerAccounts()
      .filter((account) => !account.archivedAt && account.id !== sourceId)

  async function create() {
    const source = runtime.selected()
    if (!source || activeFeeIntent()) return
    const workspaceId = runtime.callbacks.getWorkspaceId()
    try {
      await runtime.callbacks.loadPickerAccounts()
    } catch (error) {
      runtime.message = (error as Error).message
      return
    }
    if (
      runtime.callbacks.getWorkspaceId() !== workspaceId ||
      runtime.callbacks.getRouteData().selectedAccountId !== source.id
    )
      return
    state.editing = null
    dialogWorkspaceId = workspaceId
    intentKey = runtime.key()
    state.form = {
      fromAccountId: source.id,
      toAccountId: destinations(source.id)[0]?.id ?? '',
      amount: '',
      receivedAmount: '',
      date: todayInWarsaw(),
      description: '',
      fee: '',
      feeDescription: '',
    }
    state.open = true
  }

  async function edit(item: Transfer, isCurrent: () => boolean) {
    const workspaceId = runtime.callbacks.getWorkspaceId()
    const accountId = runtime.callbacks.getRouteData().selectedAccountId
    try {
      await runtime.callbacks.loadPickerAccounts()
    } catch (error) {
      runtime.message = (error as Error).message
      return
    }
    if (
      runtime.callbacks.getWorkspaceId() !== workspaceId ||
      runtime.callbacks.getRouteData().selectedAccountId !== accountId ||
      !isCurrent()
    )
      return
    state.editing = item
    dialogWorkspaceId = workspaceId
    intentKey = runtime.key()
    const fromAccountId =
      item.localSide === 'from'
        ? item.accountId
        : item.counterparty.visibility === 'full'
          ? item.counterparty.accountId
          : ''
    const toAccountId =
      item.localSide === 'to'
        ? item.accountId
        : item.counterparty.visibility === 'full'
          ? item.counterparty.accountId
          : ''
    const source = runtime.callbacks
      .getPickerAccounts()
      .find((account) => account.id === fromAccountId)
    const destination = runtime.callbacks
      .getPickerAccounts()
      .find((account) => account.id === toAccountId)
    state.form = {
      fromAccountId,
      toAccountId,
      amount: minorToDecimal(
        item.sentAmountMinor!,
        source?.currency ?? runtime.selected()!.currency,
      ),
      receivedAmount: minorToDecimal(
        item.receivedAmountMinor!,
        destination?.currency ?? runtime.selected()!.currency,
      ),
      date: item.date,
      description: item.description ?? '',
      fee: '',
      feeDescription: '',
    }
    state.open = true
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (dialogWorkspaceId !== runtime.callbacks.getWorkspaceId()) {
      state.open = false
      return
    }
    const source = runtime.callbacks
      .getPickerAccounts()
      .find((item) => item.id === state.form.fromAccountId)
    const destination = runtime.callbacks
      .getPickerAccounts()
      .find((item) => item.id === state.form.toAccountId)
    if (!source || !destination || runtime.pending) return
    const workspaceId = dialogWorkspaceId
    state.error = ''
    runtime.pending = true
    let transferAcknowledged = false
    try {
      if (source.id === destination.id)
        throw new Error('Choose a different destination.')
      if (state.form.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      const body = {
        toAccountId: destination.id,
        amountMinor: parseAmount(state.form.amount, source.currency),
        ...(source.currency !== destination.currency
          ? {
              receivedAmountMinor: parseAmount(
                state.form.receivedAmount,
                destination.currency,
              ),
            }
          : {}),
        date: state.form.date,
        description: state.form.description.trim() || null,
        idempotencyKey: intentKey,
        ...(state.editing
          ? { version: state.editing.version }
          : { fromAccountId: source.id }),
      }
      if (
        !state.editing &&
        state.form.fee.trim() &&
        !activeFeeIntent(workspaceId)
      ) {
        setActiveFeeIntent(
          {
            path: `/workspaces/${workspaceId}/accounts/${source.id}/transactions`,
            body: JSON.stringify({
              kind: 'expense',
              amountMinor: parseAmount(state.form.fee, source.currency),
              date: state.form.date,
              description: state.form.feeDescription.trim() || 'Transfer fee',
              idempotencyKey: runtime.key(),
            }),
          },
          workspaceId,
        )
      }
      await api(
        `/workspaces/${workspaceId}/transfers${state.editing ? `/${state.editing.id}` : ''}`,
        {
          method: state.editing ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        },
      )
      transferAcknowledged = true
      const retainedFee = activeFeeIntent(workspaceId)
      if (!state.editing && retainedFee) {
        try {
          await api(retainedFee.path, {
            method: 'POST',
            body: retainedFee.body,
          })
          setActiveFeeIntent(null, workspaceId)
        } catch (error) {
          state.open = false
          if (runtime.callbacks.getWorkspaceId() === workspaceId) {
            runtime.message = `Transfer succeeded, but the separate fee expense failed: ${(error as Error).message}`
            try {
              await runtime.callbacks.reloadAccounts()
            } catch (refreshError) {
              runtime.message += ` Dashboard refresh also failed: ${(refreshError as Error).message}`
            }
          }
          return
        }
      }
      if (runtime.callbacks.getWorkspaceId() === workspaceId) {
        state.open = false
        await runtime.callbacks.reloadAccounts()
      }
    } catch (error) {
      if (!transferAcknowledged) setActiveFeeIntent(null, workspaceId)
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        state.error = (error as Error).message
    } finally {
      runtime.pending = false
    }
  }

  async function action(
    item: { id: string; version: number },
    action: 'trash' | 'restore',
  ) {
    if (runtime.pending || runtime.selected()?.archivedAt) return
    const workspaceId = runtime.callbacks.getWorkspaceId()
    runtime.pending = true
    const intent = runtime.actionIntent(`transfers:${item.id}:${action}`)
    try {
      await api(`/workspaces/${workspaceId}/transfers/${item.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          version: item.version,
          idempotencyKey: intent.key,
        }),
      })
      runtime.clearActionIntent()
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        await runtime.callbacks.reloadAccounts()
    } catch (error) {
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        runtime.message = (error as Error).message
    } finally {
      runtime.pending = false
    }
  }

  async function retryFee(workspaceId = runtime.callbacks.getWorkspaceId()) {
    const retainedFee = activeFeeIntent(workspaceId)
    if (!retainedFee || runtime.pending) return
    runtime.pending = true
    try {
      await api(retainedFee.path, { method: 'POST', body: retainedFee.body })
      setActiveFeeIntent(null, workspaceId)
      if (runtime.callbacks.getWorkspaceId() === workspaceId) {
        runtime.message = ''
        await runtime.callbacks.reloadAccounts()
      }
    } catch (error) {
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        runtime.message = `The separate fee expense may not have been acknowledged: ${(error as Error).message}`
    } finally {
      runtime.pending = false
    }
  }

  function abandonFee() {
    setActiveFeeIntent(null)
    runtime.message = ''
  }

  return {
    dialog: {
      get open() {
        return state.open
      },
      set open(value) {
        state.open = value
      },
      get form() {
        return state.form
      },
      set form(value) {
        state.form = value
      },
      get editing() {
        return state.editing
      },
      get error() {
        return state.error
      },
    },
    destinations,
    create,
    edit,
    save,
    action,
    get feeIntent() {
      return activeFeeIntent()
    },
    retryFee,
    abandonFee,
  }
}
