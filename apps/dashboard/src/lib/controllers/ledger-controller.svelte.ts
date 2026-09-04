import type {
  Account,
  BalanceCheck,
  HistoryEntry,
  Transaction,
  Transfer,
} from '@dukat/core/ledger'
import { minorToDecimal, parseAmount } from '$lib/money'
import { todayInWarsaw } from '$lib/date'
import {
  api,
  type PickerAccount,
  type WorkspaceRouteData,
} from './workspace-controller.svelte'

export type LedgerCallbacks = {
  // Workspace identity stays outside this controller. Reading it at request
  // boundaries prevents actions from silently using a captured old workspace.
  getWorkspaceId: () => string
  getPickerAccounts: () => PickerAccount[]
  loadPickerAccounts: () => Promise<void>
  reloadAccounts: () => Promise<void>
  getRouteData: () => WorkspaceRouteData
}

export function createLedgerController(callbacks: LedgerCallbacks) {
  type ArchiveImpact = {
    accountVersion: number
    date: string
    impactToken: string
    plans: Array<{
      id: string
      action: 'stop' | 'cancel'
      description?: string | null
      date: string
    }>
  }
  const currencies = [
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

  let accounts = $derived(callbacks.getRouteData().accounts)
  let categories = $derived(callbacks.getRouteData().categories)
  let selectedId = $derived(callbacks.getRouteData().selectedAccountId)
  let message = $state('')
  let accountError = $state('')
  let transactionError = $state('')
  let accountOpen = $state(false)
  let transactionOpen = $state(false)
  let transferOpen = $state(false)
  let checkOpen = $state(false)
  let editingAccount = $state.raw<Account | null>(null)
  let editingTransaction = $state.raw<Transaction | null>(null)
  let refundingExpense = $state.raw<Transaction | null>(null)
  let editingTransfer = $state.raw<Transfer | null>(null)
  let editingCheck = $state.raw<BalanceCheck | null>(null)
  let pending = $state(false)
  let accountIntentKey = ''
  let transactionIntentKey = ''
  let transferIntentKey = ''
  let checkIntentKey = ''

  // Reuse an intent after an ambiguous network failure. A new key could make a
  // retry create a second server-side record even if the first request worked.
  let actionIntent: { name: string; key: string; body?: string } | null = null
  type RetainedIntent = { path: string; body: string }
  let correctionIntents = $state.raw<
    Record<string, RetainedIntent & { checkId: string }>
  >({})
  let feeIntents = $state.raw<Record<string, RetainedIntent>>({})
  let historyOpen = $state(false)
  let historyTitle = $state('')
  let history = $state.raw<HistoryEntry[]>([])
  let recentMerchants = $state.raw<string[]>([])
  let recentCategoryIds = $state.raw<string[]>([])
  let accountForm = $state({
    name: '',
    type: 'current' as Account['type'],
    currency: 'USD',
    openingDate: todayInWarsaw(),
    amount: '0',
  })
  let transactionForm = $state({
    accountId: '',
    kind: 'expense' as Transaction['kind'],
    amount: '',
    date: todayInWarsaw(),
    merchant: '',
    description: '',
    categoryId: '',
  })
  let transferForm = $state({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    receivedAmount: '',
    date: todayInWarsaw(),
    description: '',
    fee: '',
    feeDescription: '',
  })
  let checkForm = $state({ amount: '', date: todayInWarsaw() })
  const selected = () => accounts.find((account) => account.id === selectedId)
  const key = () => `${Date.now()}-${crypto.randomUUID()}`

  function activeCorrectionIntent(workspaceId = callbacks.getWorkspaceId()) {
    return correctionIntents[workspaceId] ?? null
  }
  function setActiveCorrectionIntent(
    value: (RetainedIntent & { checkId: string }) | null,
    workspaceId = callbacks.getWorkspaceId(),
  ) {
    if (!workspaceId) return
    const next = { ...correctionIntents }
    if (value) next[workspaceId] = value
    else delete next[workspaceId]
    correctionIntents = next
  }
  function activeFeeIntent(workspaceId = callbacks.getWorkspaceId()) {
    return feeIntents[workspaceId] ?? null
  }
  function setActiveFeeIntent(
    value: RetainedIntent | null,
    workspaceId = callbacks.getWorkspaceId(),
  ) {
    if (!workspaceId) return
    const next = { ...feeIntents }
    if (value) next[workspaceId] = value
    else delete next[workspaceId]
    feeIntents = next
  }
  function newAccount() {
    editingAccount = null
    accountError = ''
    accountIntentKey = key()
    accountForm = {
      name: '',
      type: 'current',
      currency: 'USD',
      openingDate: todayInWarsaw(),
      amount: '0',
    }
    accountOpen = true
  }
  function editAccount(account: Account) {
    editingAccount = account
    accountError = ''
    accountIntentKey = key()
    accountForm = {
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingDate: account.openingDate,
      amount: minorToDecimal(account.openingBalanceMinor, account.currency),
    }
    accountOpen = true
  }
  async function saveAccount(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    accountError = ''
    pending = true
    try {
      const body = {
        name: accountForm.name.trim(),
        type: accountForm.type,
        currency: accountForm.currency.toUpperCase(),
        openingDate: accountForm.openingDate,
        openingBalanceMinor: parseAmount(
          accountForm.amount,
          accountForm.currency,
          true,
        ),
        idempotencyKey: accountIntentKey,
        ...(editingAccount ? { version: editingAccount.version } : {}),
      }
      await api(
        `/workspaces/${callbacks.getWorkspaceId()}/accounts${editingAccount ? `/${editingAccount.id}` : ''}`,
        { method: editingAccount ? 'PUT' : 'POST', body: JSON.stringify(body) },
      )
      accountOpen = false
      await callbacks.reloadAccounts()
    } catch (error) {
      accountError = (error as Error).message
    } finally {
      pending = false
    }
  }
  async function accountAction(action: 'archive' | 'restore' | 'delete') {
    const account = selected()
    if (!account) return false
    if (action === 'delete' && !confirm(`Permanently delete ${account.name}?`))
      return false
    if (pending) return false
    const workspaceId = callbacks.getWorkspaceId()
    pending = true
    const name = `${account.id}:${action}`
    if (actionIntent?.name !== name) actionIntent = { name, key: key() }
    try {
      if (!actionIntent.body) {
        let impact: ArchiveImpact | null = null
        if (action === 'archive') {
          impact = (await api(
            `/workspaces/${workspaceId}/accounts/${account.id}/archive-impact`,
          )) as ArchiveImpact
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

        // Keep the approved impact token and exact body together. Rebuilding a
        // retry could archive against a plan impact the user never approved.
        actionIntent.body = JSON.stringify({
          version: account.version,
          idempotencyKey: actionIntent.key,
          ...(impact ? { impactToken: impact.impactToken } : {}),
        })
      }
      await api(`/workspaces/${workspaceId}/accounts/${account.id}/${action}`, {
        method: 'POST',
        body: actionIntent.body,
      })
      actionIntent = null
      if (action !== 'delete' && callbacks.getWorkspaceId() === workspaceId)
        await callbacks.reloadAccounts()
      return true
    } catch (error) {
      if (callbacks.getWorkspaceId() === workspaceId) {
        message = (error as Error).message
        if (message.toLowerCase().includes('archive impact changed'))
          actionIntent = null
      }
      return false
    } finally {
      pending = false
    }
  }
  async function loadTransactionSuggestions(workspaceId: string) {
    try {
      const transactions = (await api(
        `/workspaces/${workspaceId}/transactions?limit=50`,
      )) as Transaction[]
      if (callbacks.getWorkspaceId() !== workspaceId) return
      const merchantKeys: string[] = []
      recentMerchants = transactions
        .map(({ merchant }) => merchant?.trim() ?? '')
        .filter((merchant) => {
          const normalized = merchant.toLocaleLowerCase()
          if (!normalized || merchantKeys.includes(normalized)) return false
          merchantKeys.push(normalized)
          return true
        })
        .slice(0, 5)
      recentCategoryIds = transactions
        .map(({ categoryId }) => categoryId)
        .filter(
          (categoryId, index, categoryIds): categoryId is string =>
            Boolean(categoryId) && categoryIds.indexOf(categoryId) === index,
        )
        .slice(0, 5)
    } catch {
      // Suggestions make entry faster but never block it.
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
      // Browser storage is an optional convenience.
    }
  }
  function newTransaction(preferredAccountId?: string) {
    const workspaceId = callbacks.getWorkspaceId()
    const account = selected()
    const rememberedId = rememberedAccount(workspaceId)
    const usableAccount = (id?: string | null) =>
      accounts.find((candidate) => candidate.id === id && !candidate.archivedAt)
    editingTransaction = null
    refundingExpense = null
    transactionError = ''
    transactionIntentKey = key()
    transactionForm = {
      accountId:
        usableAccount(preferredAccountId)?.id ||
        usableAccount(rememberedId)?.id ||
        (account && !account.archivedAt ? account.id : '') ||
        accounts.find(({ archivedAt }) => !archivedAt)?.id ||
        '',
      kind: 'expense',
      amount: '',
      date: todayInWarsaw(),
      merchant: '',
      description: '',
      categoryId: '',
    }
    transactionOpen = true
    recentMerchants = []
    recentCategoryIds = []
    void loadTransactionSuggestions(workspaceId)
  }
  function editTransaction(item: Transaction) {
    transactionError = ''
    transactionIntentKey = key()
    recentMerchants = []
    recentCategoryIds = []
    refundingExpense = null
    editingTransaction = item
    transactionForm = {
      accountId: selected()!.id,
      kind: item.kind,
      amount: minorToDecimal(item.amountMinor, selected()!.currency),
      date: item.date,
      merchant: item.merchant ?? '',
      description: item.description ?? '',
      categoryId: item.categoryId ?? '',
    }
    transactionOpen = true
  }
  function newRefund(expense: Transaction) {
    const account = accounts.find(({ id }) => id === expense.accountId)
    if (!account || expense.kind !== 'expense' || expense.trashedAt) return
    editingTransaction = null
    refundingExpense = expense
    transactionError = ''
    transactionIntentKey = key()
    recentMerchants = []
    recentCategoryIds = []
    transactionForm = {
      accountId: expense.accountId,
      kind: 'refund',
      amount: '',
      date: todayInWarsaw(),
      merchant: expense.merchant ?? '',
      description: '',
      categoryId: expense.categoryId ?? '',
    }
    transactionOpen = true
  }
  async function saveTransaction(event: SubmitEvent) {
    event.preventDefault()
    const account = accounts.find(({ id }) => id === transactionForm.accountId)
    if (!account || pending) return
    const workspaceId = callbacks.getWorkspaceId()
    transactionError = ''
    pending = true
    try {
      if (transactionForm.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      const transactionBody = {
        kind: transactionForm.kind,
        amountMinor: parseAmount(transactionForm.amount, account.currency),
        date: transactionForm.date,
        merchant: transactionForm.merchant.trim() || null,
        description: transactionForm.description.trim() || null,
        categoryId: transactionForm.categoryId || null,
        idempotencyKey: transactionIntentKey,
        ...(editingTransaction ? { version: editingTransaction.version } : {}),
      }
      const body = refundingExpense
        ? {
            amountMinor: transactionBody.amountMinor,
            date: transactionBody.date,
            merchant: transactionBody.merchant,
            description: transactionBody.description,
            idempotencyKey: transactionBody.idempotencyKey,
          }
        : transactionBody
      const path = refundingExpense
        ? `/workspaces/${workspaceId}/transactions/${refundingExpense.id}/refunds`
        : editingTransaction
          ? `/workspaces/${workspaceId}/transactions/${editingTransaction.id}`
          : `/workspaces/${workspaceId}/accounts/${account.id}/transactions`
      await api(path, {
        method: editingTransaction ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      if (!editingTransaction && !refundingExpense)
        rememberAccount(workspaceId, account.id)
      transactionOpen = false
      await callbacks.reloadAccounts()
    } catch (error) {
      transactionError = (error as Error).message
    } finally {
      pending = false
    }
  }
  async function transactionAction(
    item: Transaction,
    action: 'trash' | 'restore',
  ) {
    if (pending || selected()?.archivedAt) return
    pending = true
    const name = `${item.id}:${action}`
    if (actionIntent?.name !== name) actionIntent = { name, key: key() }
    try {
      await api(
        `/workspaces/${callbacks.getWorkspaceId()}/transactions/${item.id}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({
            version: item.version,
            idempotencyKey: actionIntent.key,
          }),
        },
      )
      actionIntent = null
      await callbacks.reloadAccounts()
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
  const transferDestinations = (sourceId: string) => {
    return callbacks
      .getPickerAccounts()
      .filter((account) => !account.archivedAt && account.id !== sourceId)
  }
  async function newTransfer() {
    const source = selected()
    if (!source || activeFeeIntent()) return
    const sourceWorkspaceId = callbacks.getWorkspaceId()
    try {
      await callbacks.loadPickerAccounts()
    } catch (error) {
      message = (error as Error).message
      return
    }

    // The account picker spans workspaces and can be slow. Do not open a dialog
    // for a source account that stopped being selected while it loaded.
    if (
      callbacks.getWorkspaceId() !== sourceWorkspaceId ||
      selectedId !== source.id
    )
      return
    editingTransfer = null
    transferIntentKey = key()
    transferForm = {
      fromAccountId: source.id,
      toAccountId: transferDestinations(source.id)[0]?.id ?? '',
      amount: '',
      receivedAmount: '',
      date: todayInWarsaw(),
      description: '',
      fee: '',
      feeDescription: '',
    }
    transferOpen = true
  }
  async function editTransfer(item: Transfer, isCurrent: () => boolean) {
    const sourceWorkspaceId = callbacks.getWorkspaceId()
    const sourceAccountId = selectedId
    try {
      await callbacks.loadPickerAccounts()
    } catch (error) {
      message = (error as Error).message
      return
    }

    // Besides identity, confirm that the transfer still belongs to the latest
    // loaded ledger. It may have disappeared during the cross-workspace fetch.
    if (
      callbacks.getWorkspaceId() !== sourceWorkspaceId ||
      selectedId !== sourceAccountId ||
      !isCurrent()
    )
      return
    editingTransfer = item
    transferIntentKey = key()
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
    const source = callbacks
      .getPickerAccounts()
      .find((account) => account.id === fromAccountId)
    const destination = callbacks
      .getPickerAccounts()
      .find((account) => account.id === toAccountId)
    transferForm = {
      fromAccountId,
      toAccountId,
      amount: minorToDecimal(
        item.sentAmountMinor!,
        source?.currency ?? selected()!.currency,
      ),
      receivedAmount: minorToDecimal(
        item.receivedAmountMinor!,
        destination?.currency ?? selected()!.currency,
      ),
      date: item.date,
      description: item.description ?? '',
      fee: '',
      feeDescription: '',
    }
    transferOpen = true
  }
  async function saveTransfer(event: SubmitEvent) {
    event.preventDefault()
    const source = callbacks
      .getPickerAccounts()
      .find((item) => item.id === transferForm.fromAccountId)
    const destination = callbacks
      .getPickerAccounts()
      .find((item) => item.id === transferForm.toAccountId)
    if (!source || !destination || pending) return
    const sourceWorkspaceId = callbacks.getWorkspaceId()
    transactionError = ''
    pending = true
    let transferAcknowledged = false
    try {
      if (source.id === destination.id)
        throw new Error('Choose a different destination.')
      if (transferForm.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      const body = {
        toAccountId: destination.id,
        amountMinor: parseAmount(transferForm.amount, source.currency),
        ...(source.currency !== destination.currency
          ? {
              receivedAmountMinor: parseAmount(
                transferForm.receivedAmount,
                destination.currency,
              ),
            }
          : {}),
        date: transferForm.date,
        description: transferForm.description.trim() || null,
        idempotencyKey: transferIntentKey,
        ...(editingTransfer
          ? { version: editingTransfer.version }
          : { fromAccountId: source.id }),
      }
      if (
        !editingTransfer &&
        transferForm.fee.trim() &&
        !activeFeeIntent(sourceWorkspaceId)
      ) {
        // The fee is a separate transaction, not part of the transfer's atomic
        // write. Retain its exact request so a partial success can be retried.
        setActiveFeeIntent(
          {
            path: `/workspaces/${sourceWorkspaceId}/accounts/${source.id}/transactions`,
            body: JSON.stringify({
              kind: 'expense',
              amountMinor: parseAmount(transferForm.fee, source.currency),
              date: transferForm.date,
              description: transferForm.feeDescription.trim() || 'Transfer fee',
              idempotencyKey: key(),
            }),
          },
          sourceWorkspaceId,
        )
      }
      await api(
        `/workspaces/${sourceWorkspaceId}/transfers${editingTransfer ? `/${editingTransfer.id}` : ''}`,
        {
          method: editingTransfer ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        },
      )
      transferAcknowledged = true
      const retainedFee = activeFeeIntent(sourceWorkspaceId)
      if (!editingTransfer && retainedFee) {
        try {
          await api(retainedFee.path, {
            method: 'POST',
            body: retainedFee.body,
          })
          setActiveFeeIntent(null, sourceWorkspaceId)
        } catch (error) {
          transferOpen = false
          if (callbacks.getWorkspaceId() === sourceWorkspaceId) {
            message = `Transfer succeeded, but the separate fee expense failed: ${(error as Error).message}`
            try {
              await callbacks.reloadAccounts()
            } catch (refreshError) {
              message += ` Dashboard refresh also failed: ${(refreshError as Error).message}`
            }
          }
          return
        }
      }
      transferOpen = false
      if (callbacks.getWorkspaceId() === sourceWorkspaceId)
        await callbacks.reloadAccounts()
    } catch (error) {
      // Once the transfer is acknowledged, only the retained fee may need a
      // retry. Before acknowledgement, retaining it could create an orphan fee.
      if (!transferAcknowledged) setActiveFeeIntent(null, sourceWorkspaceId)
      if (callbacks.getWorkspaceId() === sourceWorkspaceId)
        transactionError = (error as Error).message
    } finally {
      pending = false
    }
  }
  async function entityAction(
    entity: 'transfers' | 'balance-checks' | 'corrections',
    item: { id: string; version: number },
    action: 'trash' | 'restore',
  ) {
    if (pending || selected()?.archivedAt) return
    pending = true
    const name = `${entity}:${item.id}:${action}`
    if (actionIntent?.name !== name) actionIntent = { name, key: key() }
    try {
      await api(
        `/workspaces/${callbacks.getWorkspaceId()}/${entity}/${item.id}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({
            version: item.version,
            idempotencyKey: actionIntent.key,
          }),
        },
      )
      actionIntent = null
      await callbacks.reloadAccounts()
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
  function newCheck() {
    editingCheck = null
    checkIntentKey = key()
    checkForm = { amount: '', date: todayInWarsaw() }
    checkOpen = true
  }
  function editCheck(item: BalanceCheck) {
    editingCheck = item
    checkIntentKey = key()
    checkForm = {
      amount: minorToDecimal(item.observedBalanceMinor, selected()!.currency),
      date: item.date,
    }
    checkOpen = true
  }
  async function saveCheck(event: SubmitEvent) {
    event.preventDefault()
    const account = selected()
    if (!account || pending) return
    transactionError = ''
    pending = true
    try {
      if (checkForm.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      await api(
        `/workspaces/${callbacks.getWorkspaceId()}/balance-checks${editingCheck ? `/${editingCheck.id}` : ''}`,
        {
          method: editingCheck ? 'PUT' : 'POST',
          body: JSON.stringify({
            date: checkForm.date,
            observedBalanceMinor: parseAmount(
              checkForm.amount,
              account.currency,
              true,
            ),
            idempotencyKey: checkIntentKey,
            ...(editingCheck
              ? { version: editingCheck.version }
              : { accountId: account.id }),
          }),
        },
      )
      checkOpen = false
      await callbacks.reloadAccounts()
    } catch (error) {
      transactionError = (error as Error).message
    } finally {
      pending = false
    }
  }
  async function createCorrection(item: BalanceCheck) {
    const difference = item.differenceMinor
    if (!difference || difference === '0' || pending) return
    if (
      !confirm(
        `Create a separate correction for the balance snapshot on ${item.date}?`,
      )
    )
      return
    const workspaceId = callbacks.getWorkspaceId()

    // Preserve both amount and idempotency key after a lost response. The
    // balance difference may change after a refresh, but this retry must not.
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
            idempotencyKey: key(),
          }),
        },
        workspaceId,
      )
    }
    await retryCorrection(workspaceId)
  }
  async function retryCorrection(workspaceId = callbacks.getWorkspaceId()) {
    const retainedCorrection = activeCorrectionIntent(workspaceId)
    if (!retainedCorrection || pending) return
    pending = true
    try {
      await api(retainedCorrection.path, {
        method: 'POST',
        body: retainedCorrection.body,
      })
      setActiveCorrectionIntent(null, workspaceId)
      if (callbacks.getWorkspaceId() === workspaceId)
        await callbacks.reloadAccounts()
    } catch (error) {
      if (callbacks.getWorkspaceId() === workspaceId)
        message = (error as Error).message
    } finally {
      pending = false
    }
  }
  async function retryFee(workspaceId = callbacks.getWorkspaceId()) {
    const retainedFee = activeFeeIntent(workspaceId)
    if (!retainedFee || pending) return
    pending = true
    try {
      await api(retainedFee.path, { method: 'POST', body: retainedFee.body })
      setActiveFeeIntent(null, workspaceId)
      if (callbacks.getWorkspaceId() === workspaceId) {
        message = ''
        await callbacks.reloadAccounts()
      }
    } catch (error) {
      if (callbacks.getWorkspaceId() === workspaceId)
        message = `The separate fee expense may not have been acknowledged: ${(error as Error).message}`
    } finally {
      pending = false
    }
  }
  function abandonCorrection() {
    setActiveCorrectionIntent(null)
    message = ''
  }
  function abandonFee() {
    setActiveFeeIntent(null)
    message = ''
  }
  async function showHistory(
    entity:
      | 'accounts'
      | 'transactions'
      | 'transfers'
      | 'balance-checks'
      | 'corrections',
    id: string,
    title: string,
  ) {
    historyTitle = title
    history = []
    historyOpen = true
    try {
      history = await api(
        `/workspaces/${callbacks.getWorkspaceId()}/${entity}/${id}/history`,
      )
    } catch (error) {
      message = (error as Error).message
      historyOpen = false
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

  // Accessors expose route data and let dialog bindings write through to their
  // local UI state.
  return {
    currencies,
    get accounts() {
      return accounts
    },
    get categories() {
      return categories
    },
    get selectedId() {
      return selectedId
    },
    get message() {
      return message
    },
    set message(value) {
      message = value
    },
    get accountError() {
      return accountError
    },
    set accountError(value) {
      accountError = value
    },
    get transactionError() {
      return transactionError
    },
    set transactionError(value) {
      transactionError = value
    },
    get accountOpen() {
      return accountOpen
    },
    set accountOpen(value) {
      accountOpen = value
    },
    get transactionOpen() {
      return transactionOpen
    },
    set transactionOpen(value) {
      transactionOpen = value
    },
    get transferOpen() {
      return transferOpen
    },
    set transferOpen(value) {
      transferOpen = value
    },
    get checkOpen() {
      return checkOpen
    },
    set checkOpen(value) {
      checkOpen = value
    },
    get editingAccount() {
      return editingAccount
    },
    set editingAccount(value) {
      editingAccount = value
    },
    get editingTransaction() {
      return editingTransaction
    },
    set editingTransaction(value) {
      editingTransaction = value
    },
    get refundingExpense() {
      return refundingExpense
    },
    get editingTransfer() {
      return editingTransfer
    },
    set editingTransfer(value) {
      editingTransfer = value
    },
    get editingCheck() {
      return editingCheck
    },
    set editingCheck(value) {
      editingCheck = value
    },
    get pending() {
      return pending
    },
    set pending(value) {
      pending = value
    },
    get correctionIntent() {
      return activeCorrectionIntent()
    },
    set correctionIntent(value) {
      setActiveCorrectionIntent(value)
    },
    get feeIntent() {
      return activeFeeIntent()
    },
    set feeIntent(value) {
      setActiveFeeIntent(value)
    },
    get historyOpen() {
      return historyOpen
    },
    set historyOpen(value) {
      historyOpen = value
    },
    get historyTitle() {
      return historyTitle
    },
    set historyTitle(value) {
      historyTitle = value
    },
    get history() {
      return history
    },
    set history(value) {
      history = value
    },
    get recentMerchants() {
      return recentMerchants
    },
    get recentCategoryIds() {
      return recentCategoryIds
    },
    get accountForm() {
      return accountForm
    },
    set accountForm(value) {
      accountForm = value
    },
    get transactionForm() {
      return transactionForm
    },
    set transactionForm(value) {
      transactionForm = value
    },
    get transferForm() {
      return transferForm
    },
    set transferForm(value) {
      transferForm = value
    },
    get checkForm() {
      return checkForm
    },
    set checkForm(value) {
      checkForm = value
    },
    selected,
    newAccount,
    editAccount,
    saveAccount,
    accountAction,
    newTransaction,
    editTransaction,
    newRefund,
    saveTransaction,
    transactionAction,
    transferDestinations,
    newTransfer,
    editTransfer,
    saveTransfer,
    entityAction,
    newCheck,
    editCheck,
    saveCheck,
    createCorrection,
    retryCorrection,
    retryFee,
    abandonCorrection,
    abandonFee,
    showHistory,
    changed,
  }
}
