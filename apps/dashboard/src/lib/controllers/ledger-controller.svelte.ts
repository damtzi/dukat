import type {
  Account,
  BalanceCheck,
  Correction,
  HistoryEntry,
  Transaction,
  Transfer,
} from '@dukat/core/ledger'
import type { Category } from '@dukat/core/csv-import'
import { minorToDecimal, parseAmount } from '$lib/money'
import { todayInWarsaw } from '$lib/date'
import { api, type PickerAccount } from './workspace-controller.svelte'

export type LedgerCallbacks = {
  // Workspace identity stays outside this controller. Reading it at request
  // boundaries prevents actions from silently using a captured old workspace.
  getWorkspaceId: () => string
  getPickerAccounts: () => PickerAccount[]
  loadPickerAccounts: () => Promise<void>
  reloadAccounts: () => Promise<void>
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

  let accounts = $state.raw<Account[]>([])
  let categories = $state.raw<Category[]>([])
  let insightsVersion = $state(0)
  let selectedId = $state('')
  let transactions = $state.raw<Transaction[]>([])
  let transfers = $state.raw<Transfer[]>([])
  let balanceChecks = $state.raw<BalanceCheck[]>([])
  let corrections = $state.raw<Correction[]>([])
  let message = $state('')
  let accountError = $state('')
  let transactionError = $state('')
  let accountOpen = $state(false)
  let transactionOpen = $state(false)
  let transferOpen = $state(false)
  let checkOpen = $state(false)
  let editingAccount = $state.raw<Account | null>(null)
  let editingTransaction = $state.raw<Transaction | null>(null)
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
  let correctionIntent = $state.raw<
    (RetainedIntent & { checkId: string }) | null
  >(null)
  let feeIntent = $state.raw<RetainedIntent | null>(null)
  let historyOpen = $state(false)
  let historyTitle = $state('')
  let history = $state.raw<HistoryEntry[]>([])
  let accountForm = $state({
    name: '',
    type: 'current' as Account['type'],
    currency: 'USD',
    amount: '0',
  })
  let transactionForm = $state({
    kind: 'expense' as Transaction['kind'],
    amount: '',
    date: todayInWarsaw(),
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
  let ledgerLoadGeneration = 0

  const selected = () => accounts.find((account) => account.id === selectedId)
  const key = () => `${Date.now()}-${crypto.randomUUID()}`

  async function loadLedger(
    targetWorkspaceId = callbacks.getWorkspaceId(),
    targetAccountId = selectedId,
  ): Promise<void> {
    // Account and workspace checks alone do not catch A→B→A switches. The
    // generation also proves this is the newest ledger request.
    const generation = ++ledgerLoadGeneration
    if (!targetAccountId) {
      if (
        generation !== ledgerLoadGeneration ||
        callbacks.getWorkspaceId() !== targetWorkspaceId
      )
        return
      transactions = []
      transfers = []
      balanceChecks = []
      corrections = []
      return
    }
    const base = `/workspaces/${targetWorkspaceId}/accounts/${targetAccountId}`
    const [
      loadedTransactions,
      loadedTransfers,
      loadedChecks,
      loadedCorrections,
    ] = await Promise.all([
      api(`${base}/transactions?includeTrashed=true`),
      api(`${base}/transfers?includeTrashed=true`),
      api(`${base}/balance-checks?includeTrashed=true`),
      api(`${base}/corrections?includeTrashed=true`),
    ])
    if (
      generation !== ledgerLoadGeneration ||
      callbacks.getWorkspaceId() !== targetWorkspaceId ||
      selectedId !== targetAccountId
    )
      return
    transactions = loadedTransactions
    transfers = loadedTransfers
    balanceChecks = loadedChecks
    corrections = loadedCorrections
  }
  async function choose(id: string) {
    selectedId = id
    message = ''
    await loadLedger(callbacks.getWorkspaceId(), id)
  }
  function newAccount() {
    editingAccount = null
    accountError = ''
    accountIntentKey = key()
    accountForm = { name: '', type: 'current', currency: 'USD', amount: '0' }
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
    if (!account) return
    if (action === 'delete' && !confirm(`Permanently delete ${account.name}?`))
      return
    if (pending) return
    pending = true
    const name = `${account.id}:${action}`
    if (actionIntent?.name !== name) actionIntent = { name, key: key() }
    try {
      if (!actionIntent.body) {
        let impact: ArchiveImpact | null = null
        if (action === 'archive') {
          impact = (await api(
            `/workspaces/${callbacks.getWorkspaceId()}/accounts/${account.id}/archive-impact`,
          )) as ArchiveImpact
          const details = impact.plans.length
            ? `\n\nAffected plans:\n${impact.plans
                .map(
                  (plan) =>
                    `• ${plan.action === 'stop' ? 'Stop' : 'Cancel'} ${plan.description || `plan from ${plan.date}`}`,
                )
                .join('\n')}`
            : '\n\nNo plans are affected.'
          if (!confirm(`Archive ${account.name}?${details}`)) return
        }

        // Keep the approved impact token and exact body together. Rebuilding a
        // retry could archive against a plan impact the user never approved.
        actionIntent.body = JSON.stringify({
          version: account.version,
          idempotencyKey: actionIntent.key,
          ...(impact ? { impactToken: impact.impactToken } : {}),
        })
      }
      await api(
        `/workspaces/${callbacks.getWorkspaceId()}/accounts/${account.id}/${action}`,
        {
          method: 'POST',
          body: actionIntent.body,
        },
      )
      actionIntent = null
      await callbacks.reloadAccounts()
    } catch (error) {
      message = (error as Error).message
      if (message.toLowerCase().includes('archive impact changed'))
        actionIntent = null
    } finally {
      pending = false
    }
  }
  function newTransaction() {
    editingTransaction = null
    transactionError = ''
    transactionIntentKey = key()
    transactionForm = {
      kind: 'expense',
      amount: '',
      date: todayInWarsaw(),
      description: '',
      categoryId: '',
    }
    transactionOpen = true
  }
  function editTransaction(item: Transaction) {
    transactionError = ''
    transactionIntentKey = key()
    editingTransaction = item
    transactionForm = {
      kind: item.kind,
      amount: minorToDecimal(item.amountMinor, selected()!.currency),
      date: item.date,
      description: item.description ?? '',
      categoryId: item.categoryId ?? '',
    }
    transactionOpen = true
  }
  async function saveTransaction(event: SubmitEvent) {
    event.preventDefault()
    const account = selected()
    if (!account || pending) return
    transactionError = ''
    pending = true
    try {
      if (transactionForm.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      const body = {
        kind: transactionForm.kind,
        amountMinor: parseAmount(transactionForm.amount, account.currency),
        date: transactionForm.date,
        description: transactionForm.description.trim() || null,
        categoryId: transactionForm.categoryId || null,
        idempotencyKey: transactionIntentKey,
        ...(editingTransaction ? { version: editingTransaction.version } : {}),
      }
      const path = editingTransaction
        ? `/workspaces/${callbacks.getWorkspaceId()}/transactions/${editingTransaction.id}`
        : `/workspaces/${callbacks.getWorkspaceId()}/accounts/${account.id}/transactions`
      await api(path, {
        method: editingTransaction ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
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
    if (!source || feeIntent) return
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
  async function editTransfer(item: Transfer) {
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
      !transfers.some((transfer) => transfer.id === item.id)
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
      if (!editingTransfer && transferForm.fee.trim() && !feeIntent) {
        // The fee is a separate transaction, not part of the transfer's atomic
        // write. Retain its exact request so a partial success can be retried.
        feeIntent = {
          path: `/workspaces/${callbacks.getWorkspaceId()}/accounts/${source.id}/transactions`,
          body: JSON.stringify({
            kind: 'expense',
            amountMinor: parseAmount(transferForm.fee, source.currency),
            date: transferForm.date,
            description: transferForm.feeDescription.trim() || 'Transfer fee',
            idempotencyKey: key(),
          }),
        }
      }
      await api(
        `/workspaces/${callbacks.getWorkspaceId()}/transfers${editingTransfer ? `/${editingTransfer.id}` : ''}`,
        {
          method: editingTransfer ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        },
      )
      transferAcknowledged = true
      if (!editingTransfer && feeIntent) {
        try {
          await api(feeIntent.path, { method: 'POST', body: feeIntent.body })
          feeIntent = null
        } catch (error) {
          transferOpen = false
          message = `Transfer succeeded, but the separate fee expense failed: ${(error as Error).message}`
          try {
            await callbacks.reloadAccounts()
          } catch (refreshError) {
            message += ` Dashboard refresh also failed: ${(refreshError as Error).message}`
          }
          return
        }
      }
      transferOpen = false
      await callbacks.reloadAccounts()
    } catch (error) {
      // Once the transfer is acknowledged, only the retained fee may need a
      // retry. Before acknowledgement, retaining it could create an orphan fee.
      if (!transferAcknowledged) feeIntent = null
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

    // Preserve both amount and idempotency key after a lost response. The
    // balance difference may change after a refresh, but this retry must not.
    if (correctionIntent?.checkId !== item.id) {
      correctionIntent = {
        checkId: item.id,
        path: `/workspaces/${callbacks.getWorkspaceId()}/corrections`,
        body: JSON.stringify({
          accountId: item.accountId,
          date: item.date,
          amountMinor: difference,
          description: `Balance correction for check on ${item.date}`,
          idempotencyKey: key(),
        }),
      }
    }
    await retryCorrection()
  }
  async function retryCorrection() {
    if (!correctionIntent || pending) return
    pending = true
    try {
      await api(correctionIntent.path, {
        method: 'POST',
        body: correctionIntent.body,
      })
      correctionIntent = null
      await callbacks.reloadAccounts()
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
  async function retryFee() {
    if (!feeIntent || pending) return
    pending = true
    try {
      await api(feeIntent.path, { method: 'POST', body: feeIntent.body })
      feeIntent = null
      message = ''
      await callbacks.reloadAccounts()
    } catch (error) {
      message = `The separate fee expense may not have been acknowledged: ${(error as Error).message}`
    } finally {
      pending = false
    }
  }
  function abandonCorrection() {
    correctionIntent = null
    message = ''
  }
  function abandonFee() {
    feeIntent = null
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

  function invalidateLedgerRequests() {
    ledgerLoadGeneration++
  }
  function resetWorkspaceData() {
    accounts = []
    categories = []
    selectedId = ''
    transactions = []
    transfers = []
    balanceChecks = []
    corrections = []
    insightsVersion++
  }
  function applyAccounts(
    loadedAccounts: Account[],
    loadedCategories: Category[],
  ) {
    accounts = loadedAccounts
    categories = loadedCategories
  }
  function chooseAccount(loadedAccounts: Account[]) {
    selectedId = loadedAccounts.some((account) => account.id === selectedId)
      ? selectedId
      : (loadedAccounts.find((account) => !account.archivedAt)?.id ??
        loadedAccounts[0]?.id ??
        '')
    return selectedId
  }
  function incrementInsightsVersion() {
    insightsVersion++
  }

  // Accessors keep rune-backed values reactive and also let dialog bindings
  // write through to this closure without exposing its internal variables.
  return {
    currencies,
    get accounts() {
      return accounts
    },
    set accounts(value) {
      accounts = value
    },
    get categories() {
      return categories
    },
    set categories(value) {
      categories = value
    },
    get insightsVersion() {
      return insightsVersion
    },
    set insightsVersion(value) {
      insightsVersion = value
    },
    get selectedId() {
      return selectedId
    },
    set selectedId(value) {
      selectedId = value
    },
    get transactions() {
      return transactions
    },
    set transactions(value) {
      transactions = value
    },
    get transfers() {
      return transfers
    },
    set transfers(value) {
      transfers = value
    },
    get balanceChecks() {
      return balanceChecks
    },
    set balanceChecks(value) {
      balanceChecks = value
    },
    get corrections() {
      return corrections
    },
    set corrections(value) {
      corrections = value
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
      return correctionIntent
    },
    set correctionIntent(value) {
      correctionIntent = value
    },
    get feeIntent() {
      return feeIntent
    },
    set feeIntent(value) {
      feeIntent = value
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
    invalidateLedgerRequests,
    resetWorkspaceData,
    applyAccounts,
    chooseAccount,
    incrementInsightsVersion,
    loadLedger,
    choose,
    newAccount,
    editAccount,
    saveAccount,
    accountAction,
    newTransaction,
    editTransaction,
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
