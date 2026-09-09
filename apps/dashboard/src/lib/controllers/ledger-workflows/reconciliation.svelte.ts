import type { BalanceCheck } from '@dukat/core/ledger'
import { todayInWarsaw } from '$lib/date'
import { minorToDecimal, parseAmount } from '$lib/money'
import { api } from '../workspace-controller.svelte'
import type { LedgerRuntime } from './runtime.svelte'

type RetainedCorrection = { checkId: string; path: string; body: string }

export function createReconciliationWorkflow(runtime: LedgerRuntime) {
  const state = $state({
    open: false,
    error: '',
    editing: null as BalanceCheck | null,
    form: { amount: '', date: todayInWarsaw() },
  })
  let intentKey = ''
  let dialogWorkspaceId = ''
  let correctionIntents = $state.raw<Record<string, RetainedCorrection>>({})

  const activeCorrectionIntent = (
    workspaceId = runtime.callbacks.getWorkspaceId(),
  ) => correctionIntents[workspaceId] ?? null

  function setActiveCorrectionIntent(
    value: RetainedCorrection | null,
    workspaceId = runtime.callbacks.getWorkspaceId(),
  ) {
    if (!workspaceId) return
    const next = { ...correctionIntents }
    if (value) next[workspaceId] = value
    else delete next[workspaceId]
    correctionIntents = next
  }

  function create() {
    dialogWorkspaceId = runtime.callbacks.getWorkspaceId()
    state.editing = null
    intentKey = runtime.key()
    state.form = { amount: '', date: todayInWarsaw() }
    state.open = true
  }

  function edit(item: BalanceCheck) {
    const account = runtime.selected()
    if (!account) return
    dialogWorkspaceId = runtime.callbacks.getWorkspaceId()
    state.editing = item
    intentKey = runtime.key()
    state.form = {
      amount: minorToDecimal(item.observedBalanceMinor, account.currency),
      date: item.date,
    }
    state.open = true
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (dialogWorkspaceId !== runtime.callbacks.getWorkspaceId()) {
      state.open = false
      return
    }
    const account = runtime.selected()
    if (!account || runtime.pending) return
    const workspaceId = dialogWorkspaceId
    state.error = ''
    runtime.pending = true
    try {
      if (state.form.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      await api(
        `/workspaces/${workspaceId}/balance-checks${state.editing ? `/${state.editing.id}` : ''}`,
        {
          method: state.editing ? 'PUT' : 'POST',
          body: JSON.stringify({
            date: state.form.date,
            observedBalanceMinor: parseAmount(
              state.form.amount,
              account.currency,
              true,
            ),
            idempotencyKey: intentKey,
            ...(state.editing
              ? { version: state.editing.version }
              : { accountId: account.id }),
          }),
        },
      )
      if (runtime.callbacks.getWorkspaceId() === workspaceId) {
        state.open = false
        await runtime.callbacks.reloadAccounts()
      }
    } catch (error) {
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        state.error = (error as Error).message
    } finally {
      runtime.pending = false
    }
  }

  async function createCorrection(item: BalanceCheck) {
    const difference = item.differenceMinor
    if (!difference || difference === '0' || runtime.pending) return
    if (
      !confirm(
        `Create a separate correction for the balance snapshot on ${item.date}?`,
      )
    )
      return
    const workspaceId = runtime.callbacks.getWorkspaceId()
    if (activeCorrectionIntent(workspaceId)?.checkId !== item.id) {
      setActiveCorrectionIntent(
        {
          checkId: item.id,
          path: `/workspaces/${workspaceId}/corrections`,
          body: JSON.stringify({
            accountId: item.accountId,
            date: item.date,
            amountMinor: difference,
            description: `Balance correction for snapshot on ${item.date}`,
            idempotencyKey: runtime.key(),
          }),
        },
        workspaceId,
      )
    }
    await retryCorrection(workspaceId)
  }

  async function retryCorrection(
    workspaceId = runtime.callbacks.getWorkspaceId(),
  ) {
    const retainedCorrection = activeCorrectionIntent(workspaceId)
    if (!retainedCorrection || runtime.pending) return
    runtime.pending = true
    try {
      await api(retainedCorrection.path, {
        method: 'POST',
        body: retainedCorrection.body,
      })
      setActiveCorrectionIntent(null, workspaceId)
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        await runtime.callbacks.reloadAccounts()
    } catch (error) {
      if (runtime.callbacks.getWorkspaceId() === workspaceId)
        runtime.message = (error as Error).message
    } finally {
      runtime.pending = false
    }
  }

  function abandonCorrection() {
    setActiveCorrectionIntent(null)
    runtime.message = ''
  }

  async function action(
    entity: 'balance-checks' | 'corrections',
    item: { id: string; version: number },
    action: 'trash' | 'restore',
  ) {
    if (runtime.pending || runtime.selected()?.archivedAt) return
    const workspaceId = runtime.callbacks.getWorkspaceId()
    runtime.pending = true
    const intent = runtime.actionIntent(`${entity}:${item.id}:${action}`)
    try {
      await api(`/workspaces/${workspaceId}/${entity}/${item.id}/${action}`, {
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
    create,
    edit,
    save,
    createCorrection,
    action,
    get correctionIntent() {
      return activeCorrectionIntent()
    },
    retryCorrection,
    abandonCorrection,
  }
}
