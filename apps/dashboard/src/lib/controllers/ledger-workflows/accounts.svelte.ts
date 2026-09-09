import { accountArchiveImpactSchema, type Account } from '@dukat/core/ledger'
import { todayInWarsaw } from '$lib/date'
import { minorToDecimal, parseAmount } from '$lib/money'
import { api, apiJson } from '../workspace-controller.svelte'
import type { LedgerRuntime } from './runtime.svelte'

export const currencies = [
  { code: 'PLN', name: 'Polish złoty' },
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'US dollar' },
  { code: 'GBP', name: 'British pound' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'CZK', name: 'Czech koruna' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'NOK', name: 'Norwegian krone' },
  { code: 'DKK', name: 'Danish krone' },
  { code: 'UAH', name: 'Ukrainian hryvnia' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'CLP', name: 'Chilean peso' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'HUF', name: 'Hungarian forint' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'ILS', name: 'Israeli new shekel' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'ISK', name: 'Icelandic króna' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'RON', name: 'Romanian leu' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'XDR', name: 'Special drawing rights' },
  { code: 'ZAR', name: 'South African rand' },
] as const

export function createAccountWorkflow(runtime: LedgerRuntime) {
  const state = $state({
    open: false,
    error: '',
    editing: null as Account | null,
    form: {
      name: '',
      type: 'current' as Account['type'],
      currency: 'USD',
      openingDate: todayInWarsaw(),
      amount: '0',
    },
  })
  let intentKey = ''
  let dialogWorkspaceId = ''

  function create() {
    dialogWorkspaceId = runtime.callbacks.getWorkspaceId()
    state.editing = null
    state.error = ''
    intentKey = runtime.key()
    state.form = {
      name: '',
      type: 'current',
      currency: 'USD',
      openingDate: todayInWarsaw(),
      amount: '0',
    }
    state.open = true
  }

  function edit(account: Account) {
    dialogWorkspaceId = runtime.callbacks.getWorkspaceId()
    state.editing = account
    state.error = ''
    intentKey = runtime.key()
    state.form = {
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingDate: account.openingDate,
      amount: minorToDecimal(account.openingBalanceMinor, account.currency),
    }
    state.open = true
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (dialogWorkspaceId !== runtime.callbacks.getWorkspaceId()) {
      state.open = false
      return
    }
    if (runtime.pending) return
    const workspaceId = dialogWorkspaceId
    state.error = ''
    runtime.pending = true
    try {
      const body = {
        name: state.form.name.trim(),
        type: state.form.type,
        currency: state.form.currency.toUpperCase(),
        openingDate: state.form.openingDate,
        openingBalanceMinor: parseAmount(
          state.form.amount,
          state.form.currency,
          true,
        ),
        idempotencyKey: intentKey,
        ...(state.editing ? { version: state.editing.version } : {}),
      }
      await api(
        `/workspaces/${workspaceId}/accounts${state.editing ? `/${state.editing.id}` : ''}`,
        { method: state.editing ? 'PUT' : 'POST', body: JSON.stringify(body) },
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

  async function action(action: 'archive' | 'restore' | 'delete') {
    const account = runtime.selected()
    if (!account) return false
    if (action === 'delete' && !confirm(`Permanently delete ${account.name}?`))
      return false
    if (runtime.pending) return false
    const workspaceId = runtime.callbacks.getWorkspaceId()
    runtime.pending = true
    const intent = runtime.actionIntent(`${account.id}:${action}`)
    try {
      if (!intent.body) {
        let impact = null
        if (action === 'archive') {
          impact = await apiJson(
            `/workspaces/${workspaceId}/accounts/${account.id}/archive-impact`,
            accountArchiveImpactSchema,
          )
          if (runtime.callbacks.getWorkspaceId() !== workspaceId) return false
          const details = impact.plans.length
            ? `\n\nAffected plans:\n${impact.plans
                .map(
                  (plan) =>
                    `• ${plan.action === 'stop' ? 'Stop' : 'Cancel'} ${plan.description || `plan from ${plan.date}`}`,
                )
                .join('\n')}`
            : '\n\nNo plans are affected.'
          if (!confirm(`Archive ${account.name}?${details}`)) return false
        }
        intent.body = JSON.stringify({
          version: account.version,
          idempotencyKey: intent.key,
          ...(impact ? { impactToken: impact.impactToken } : {}),
        })
      }
      await api(`/workspaces/${workspaceId}/accounts/${account.id}/${action}`, {
        method: 'POST',
        body: intent.body,
      })
      runtime.clearActionIntent()
      if (
        action !== 'delete' &&
        runtime.callbacks.getWorkspaceId() === workspaceId
      )
        await runtime.callbacks.reloadAccounts()
      return true
    } catch (error) {
      if (runtime.callbacks.getWorkspaceId() === workspaceId) {
        runtime.message = (error as Error).message
        if (runtime.message.toLowerCase().includes('archive impact changed'))
          runtime.clearActionIntent()
      }
      return false
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
    currencies,
    get items() {
      return runtime.callbacks.getRouteData().accounts
    },
    selected: runtime.selected,
    create,
    edit,
    save,
    action,
  }
}
