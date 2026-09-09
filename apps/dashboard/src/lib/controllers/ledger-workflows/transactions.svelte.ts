import {
  transactionSchema,
  type HouseholdExpense,
  type Transaction,
} from '@dukat/core/ledger'
import { z } from 'zod'
import { todayInWarsaw } from '$lib/date'
import { minorToDecimal, parseAmount } from '$lib/money'
import {
  api,
  apiJson,
  type HouseholdMember,
} from '../workspace-controller.svelte'
import type { LedgerRuntime } from './runtime.svelte'

export function createTransactionWorkflow(runtime: LedgerRuntime) {
  const emptyForm = () => ({
    accountId: '',
    kind: 'expense' as Transaction['kind'],
    amount: '',
    date: todayInWarsaw(),
    merchant: '',
    description: '',
    categoryId: '',
    allocationMode: 'equal' as 'equal' | 'custom',
    allocations: [] as Array<{
      memberUserId: string
      name: string
      selected: boolean
      amount: string
    }>,
  })
  const state = $state({
    open: false,
    error: '',
    editing: null as Transaction | null,
    editingHouseholdExpense: null as HouseholdExpense | null,
    creatingHouseholdExpense: false,
    refundingExpense: null as Transaction | null,
    recentMerchants: [] as string[],
    recentCategoryIds: [] as string[],
    form: emptyForm(),
  })
  let intentKey = ''
  let dialogWorkspaceId = ''

  const householdExpenseAccounts = () =>
    runtime.callbacks
      .getPickerAccounts()
      .filter(
        (account) =>
          account.workspaceType === 'personal' && !account.archivedAt,
      )

  async function loadSuggestions(workspaceId: string) {
    try {
      const transactions = await apiJson(
        `/workspaces/${workspaceId}/transactions?limit=50`,
        z.array(transactionSchema),
      )
      if (runtime.callbacks.getWorkspaceId() !== workspaceId) return
      const merchantKeys: string[] = []
      state.recentMerchants = transactions
        .map(({ merchant }) => merchant?.trim() ?? '')
        .filter((merchant) => {
          const normalized = merchant.toLocaleLowerCase()
          if (!normalized || merchantKeys.includes(normalized)) return false
          merchantKeys.push(normalized)
          return true
        })
        .slice(0, 5)
      state.recentCategoryIds = transactions
        .map(({ categoryId }) => categoryId)
        .filter(
          (categoryId, index, categoryIds): categoryId is string =>
            Boolean(categoryId) && categoryIds.indexOf(categoryId) === index,
        )
        .slice(0, 5)
    } catch {
      // Suggestions are optional.
    }
  }

  function rememberedAccount(workspaceId: string) {
    try {
      return localStorage.getItem(
        `dukat:last-transaction-account:${workspaceId}`,
      )
    } catch {
      return null
    }
  }

  function rememberAccount(workspaceId: string, accountId: string) {
    try {
      localStorage.setItem(
        `dukat:last-transaction-account:${workspaceId}`,
        accountId,
      )
    } catch {
      // Browser storage is optional.
    }
  }

  function create(preferredAccountId?: string) {
    const workspaceId = runtime.callbacks.getWorkspaceId()
    dialogWorkspaceId = workspaceId
    const data = runtime.callbacks.getRouteData()
    const selected = runtime.selected()
    const usableAccount = (id?: string | null) =>
      data.accounts.find(
        (candidate) => candidate.id === id && !candidate.archivedAt,
      )
    state.editing = null
    state.editingHouseholdExpense = null
    state.creatingHouseholdExpense = false
    state.refundingExpense = null
    state.error = ''
    intentKey = runtime.key()
    state.form = {
      ...emptyForm(),
      accountId:
        usableAccount(preferredAccountId)?.id ||
        usableAccount(rememberedAccount(workspaceId))?.id ||
        (selected && !selected.archivedAt ? selected.id : '') ||
        data.accounts.find(({ archivedAt }) => !archivedAt)?.id ||
        '',
    }
    state.open = true
    state.recentMerchants = []
    state.recentCategoryIds = []
    void loadSuggestions(workspaceId)
  }

  function edit(item: Transaction) {
    const account = runtime.selected()
    if (!account) return
    dialogWorkspaceId = runtime.callbacks.getWorkspaceId()
    state.error = ''
    intentKey = runtime.key()
    state.recentMerchants = []
    state.recentCategoryIds = []
    state.refundingExpense = null
    state.editingHouseholdExpense = null
    state.creatingHouseholdExpense = false
    state.editing = item
    state.form = {
      ...emptyForm(),
      accountId: account.id,
      kind: item.kind,
      amount: minorToDecimal(item.amountMinor, account.currency),
      date: item.date,
      merchant: item.merchant ?? '',
      description: item.description ?? '',
      categoryId: item.categoryId ?? '',
    }
    state.open = true
  }

  function refund(expense: Transaction) {
    const data = runtime.callbacks.getRouteData()
    const account = data.accounts.find(({ id }) => id === expense.accountId)
    if (!account || expense.kind !== 'expense' || expense.trashedAt) return
    dialogWorkspaceId = runtime.callbacks.getWorkspaceId()
    state.editing = null
    state.editingHouseholdExpense = null
    state.creatingHouseholdExpense = false
    state.refundingExpense = expense
    state.error = ''
    intentKey = runtime.key()
    state.recentMerchants = []
    state.recentCategoryIds = []
    state.form = {
      ...emptyForm(),
      accountId: expense.accountId,
      kind: 'refund',
      merchant: expense.merchant ?? '',
      categoryId: expense.categoryId ?? '',
    }
    state.open = true
  }

  async function createHouseholdExpense() {
    const workspaceId = runtime.callbacks.getWorkspaceId()
    try {
      await runtime.callbacks.loadPickerAccounts()
    } catch (error) {
      runtime.message = (error as Error).message
      return
    }
    if (workspaceId !== runtime.callbacks.getWorkspaceId()) return
    dialogWorkspaceId = workspaceId
    state.editing = null
    state.editingHouseholdExpense = null
    state.creatingHouseholdExpense = true
    state.refundingExpense = null
    state.error = ''
    intentKey = runtime.key()
    state.form = {
      ...emptyForm(),
      accountId: householdExpenseAccounts()[0]?.id ?? '',
      allocations: runtime.callbacks
        .getRouteData()
        .members.map((member: HouseholdMember) => ({
          memberUserId: member.userId,
          name: member.name,
          selected: true,
          amount: '',
        })),
    }
    state.open = true
  }

  function editHouseholdExpense(item: HouseholdExpense) {
    if (!item.canManage) return
    dialogWorkspaceId = runtime.callbacks.getWorkspaceId()
    const members = runtime.callbacks.getRouteData().members
    state.editing = null
    state.editingHouseholdExpense = item
    state.creatingHouseholdExpense = true
    state.refundingExpense = null
    state.error = ''
    intentKey = runtime.key()
    const allocationMembers = [...members]
    for (const { member } of item.allocations)
      if (!allocationMembers.some(({ userId }) => userId === member.userId))
        allocationMembers.push({ ...member, role: 'member', joinedAt: '' })
    state.form = {
      ...emptyForm(),
      amount: minorToDecimal(item.amountMinor, item.currency),
      date: item.date,
      merchant: item.merchant ?? '',
      description: item.description ?? '',
      categoryId: item.categoryId ?? '',
      allocationMode: 'custom',
      allocations: allocationMembers.map((member) => {
        const allocation = item.allocations.find(
          ({ member: actor }) => actor.userId === member.userId,
        )
        return {
          memberUserId: member.userId,
          name: member.name,
          selected: Boolean(allocation),
          amount: allocation
            ? minorToDecimal(allocation.amountMinor, item.currency)
            : '',
        }
      }),
    }
    state.open = true
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    if (dialogWorkspaceId !== runtime.callbacks.getWorkspaceId()) {
      state.open = false
      return
    }
    const data = runtime.callbacks.getRouteData()
    const account = (
      state.creatingHouseholdExpense
        ? householdExpenseAccounts()
        : data.accounts
    ).find(({ id }) => id === state.form.accountId)
    if ((!account && !state.editingHouseholdExpense) || runtime.pending) return
    const workspaceId = dialogWorkspaceId
    state.error = ''
    runtime.pending = true
    try {
      if (state.form.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      const transactionBody = {
        kind: state.form.kind,
        amountMinor: parseAmount(
          state.form.amount,
          state.editingHouseholdExpense?.currency ?? account!.currency,
        ),
        date: state.form.date,
        merchant: state.form.merchant.trim() || null,
        description: state.form.description.trim() || null,
        categoryId: state.form.categoryId || null,
        idempotencyKey: intentKey,
        ...(state.editing ? { version: state.editing.version } : {}),
      }
      const selectedAllocations = state.form.allocations.filter(
        ({ selected }) => selected,
      )
      if (state.creatingHouseholdExpense && selectedAllocations.length === 0)
        throw new Error('Select at least one member for the allocation.')
      const currency =
        state.editingHouseholdExpense?.currency ?? account!.currency
      const allocations = state.creatingHouseholdExpense
        ? state.form.allocationMode === 'equal'
          ? (() => {
              const sorted = [...selectedAllocations].sort((a, b) =>
                a.memberUserId.localeCompare(b.memberUserId),
              )
              const total = BigInt(transactionBody.amountMinor)
              const count = BigInt(sorted.length)
              const base = total / count
              const remainder = total % count
              if (base === 0n)
                throw new Error(
                  'The expense is too small to allocate to every selected member.',
                )
              return sorted.map((allocation, index) => ({
                memberUserId: allocation.memberUserId,
                amountMinor: (
                  base + (BigInt(index) < remainder ? 1n : 0n)
                ).toString(),
              }))
            })()
          : selectedAllocations.map((allocation) => ({
              memberUserId: allocation.memberUserId,
              amountMinor: parseAmount(allocation.amount, currency),
            }))
        : undefined
      const body = state.refundingExpense
        ? {
            amountMinor: transactionBody.amountMinor,
            date: transactionBody.date,
            merchant: transactionBody.merchant,
            description: transactionBody.description,
            idempotencyKey: transactionBody.idempotencyKey,
          }
        : state.creatingHouseholdExpense
          ? {
              accountId: account?.id,
              amountMinor: transactionBody.amountMinor,
              date: transactionBody.date,
              merchant: transactionBody.merchant,
              description: transactionBody.description,
              categoryId: transactionBody.categoryId,
              allocations,
              idempotencyKey: transactionBody.idempotencyKey,
              ...(state.editingHouseholdExpense
                ? { version: state.editingHouseholdExpense.version }
                : {}),
            }
          : transactionBody
      const path = state.refundingExpense
        ? `/workspaces/${workspaceId}/transactions/${state.refundingExpense.id}/refunds`
        : state.editingHouseholdExpense
          ? `/workspaces/${workspaceId}/household-expenses/${state.editingHouseholdExpense.id}`
          : state.creatingHouseholdExpense
            ? `/workspaces/${workspaceId}/household-expenses`
            : state.editing
              ? `/workspaces/${workspaceId}/transactions/${state.editing.id}`
              : `/workspaces/${workspaceId}/accounts/${account!.id}/transactions`
      await api(path, {
        method: state.editing || state.editingHouseholdExpense ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      if (
        !state.editing &&
        !state.editingHouseholdExpense &&
        !state.refundingExpense &&
        account
      )
        rememberAccount(workspaceId, account.id)
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

  async function action(item: Transaction, action: 'trash' | 'restore') {
    if (runtime.pending || runtime.selected()?.archivedAt) return
    await runAction('transactions', item, action)
  }

  async function householdExpenseAction(
    item: HouseholdExpense,
    action: 'trash' | 'restore',
  ) {
    if (runtime.pending || !item.canManage) return
    await runAction('household-expenses', item, action)
  }

  async function runAction(
    entity: 'transactions' | 'household-expenses',
    item: { id: string; version: number },
    action: 'trash' | 'restore',
  ) {
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
      get editingHouseholdExpense() {
        return state.editingHouseholdExpense
      },
      get creatingHouseholdExpense() {
        return state.creatingHouseholdExpense
      },
      get refundingExpense() {
        return state.refundingExpense
      },
      get error() {
        return state.error
      },
      get recentMerchants() {
        return state.recentMerchants
      },
      get recentCategoryIds() {
        return state.recentCategoryIds
      },
    },
    get categories() {
      return runtime.callbacks.getRouteData().categories
    },
    create,
    edit,
    refund,
    createHouseholdExpense,
    editHouseholdExpense,
    save,
    action,
    householdExpenseAction,
    householdExpenseAccounts,
  }
}
