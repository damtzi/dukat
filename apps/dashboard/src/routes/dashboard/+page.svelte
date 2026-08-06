<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import { onMount } from 'svelte'
  import type {
    Account,
    BalanceCheck,
    Correction,
    HistoryEntry,
    Transaction,
    Transfer,
  } from '@dukat/core/ledger'
  import type { Category } from '@dukat/core/csv-import'
  import { Alert, Button, Card, Input, Label } from '@dukat/ui'
  import { minorToDecimal, parseAmount } from '$lib/money'
  import { todayInWarsaw } from '$lib/date'
  import AccountNavigation from '$lib/components/ledger/AccountNavigation.svelte'
  import AccountSummary from '$lib/components/ledger/AccountSummary.svelte'
  import TransactionsSection from '$lib/components/ledger/TransactionsSection.svelte'
  import TransfersSection from '$lib/components/ledger/TransfersSection.svelte'
  import ReconciliationSection from '$lib/components/ledger/ReconciliationSection.svelte'
  import AccountDialog from '$lib/components/ledger/AccountDialog.svelte'
  import TransactionDialog from '$lib/components/ledger/TransactionDialog.svelte'
  import TransferDialog from '$lib/components/ledger/TransferDialog.svelte'
  import BalanceCheckDialog from '$lib/components/ledger/BalanceCheckDialog.svelte'
  import HistoryDialog from '$lib/components/ledger/HistoryDialog.svelte'
  import WorkspaceSettings from '$lib/components/workspaces/WorkspaceSettings.svelte'
  import ManualRateManager from '$lib/components/workspaces/ManualRateManager.svelte'
  import CategoryManager from '$lib/components/insights/CategoryManager.svelte'
  import SummarySection from '$lib/components/insights/SummarySection.svelte'
  import CsvImports from '$lib/components/insights/CsvImports.svelte'
  import PlanningSection from '$lib/components/planning/PlanningSection.svelte'

  type Workspace = {
    id: string
    name: string
    type: 'personal' | 'household'
    reportingCurrency: string | null
    version: number
    role: 'owner' | 'member' | null
  }
  type PickerAccount = Account & { workspaceId: string; workspaceLabel: string }
  type RateStatus = {
    available: boolean
    stale: boolean
    latest: { effectiveDate: string } | null
  }
  type ConvertedBalances = {
    reportingCurrency: string
    totalMinor: string | null
    missingRate: boolean
    rates: RateProvenance[]
  }
  type WorkspaceForecast = {
    estimate: true
    reportingCurrency: string | null
    missingRate: boolean
    startingBalanceMinor: string | null
    endingBalanceMinor: string | null
    occurrences: unknown[]
  }
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
  type RateProvenance = {
    currency: string
    rateToPln: string
    source: 'identity' | 'NBP' | 'manual'
    effectiveDate: string
    tableNumber: string | null
    reason: string | null
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

  let state: 'loading' | 'ready' | 'error' = 'loading'
  let workspaces: Workspace[] = []
  let workspaceId = ''
  let accounts: Account[] = []
  let categories: Category[] = []
  let rateStatus: RateStatus | null = null
  let convertedBalances: ConvertedBalances | null = null
  let workspaceForecast: WorkspaceForecast | null = null
  let insightsVersion = 0
  let pickerAccounts: PickerAccount[] = []
  let recoverable: Workspace[] = []
  let deletionBlockers: { id: string; name: string }[] | null = null
  let selectedId = ''
  let transactions: Transaction[] = []
  let transfers: Transfer[] = []
  let balanceChecks: BalanceCheck[] = []
  let corrections: Correction[] = []
  let message = ''
  let accountError = ''
  let transactionError = ''
  let accountOpen = false
  let transactionOpen = false
  let transferOpen = false
  let checkOpen = false
  let editingAccount: Account | null = null
  let editingTransaction: Transaction | null = null
  let editingTransfer: Transfer | null = null
  let editingCheck: BalanceCheck | null = null
  let pending = false
  let accountIntentKey = ''
  let transactionIntentKey = ''
  let transferIntentKey = ''
  let checkIntentKey = ''
  let actionIntent: { name: string; key: string; body?: string } | null = null
  type RetainedIntent = { path: string; body: string }
  let correctionIntent: (RetainedIntent & { checkId: string }) | null = null
  let feeIntent: RetainedIntent | null = null
  let historyOpen = false
  let historyTitle = ''
  let history: HistoryEntry[] = []
  let accountForm = {
    name: '',
    type: 'current' as Account['type'],
    currency: 'USD',
    amount: '0',
  }
  let transactionForm = {
    kind: 'expense' as Transaction['kind'],
    amount: '',
    date: todayInWarsaw(),
    description: '',
    categoryId: '',
  }
  let transferForm = {
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    receivedAmount: '',
    date: todayInWarsaw(),
    description: '',
    fee: '',
    feeDescription: '',
  }
  let checkForm = { amount: '', date: todayInWarsaw() }
  let workspaceLoadGeneration = 0
  let accountLoadGeneration = 0
  let ledgerLoadGeneration = 0
  let accountsWorkspaceId = ''

  const selected = () => accounts.find((account) => account.id === selectedId)
  const key = () => `${Date.now()}-${crypto.randomUUID()}`
  async function api(path: string, options?: RequestInit) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...options?.headers },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(
        body.message ||
          (response.status === 409
            ? 'This item changed elsewhere. Refresh and try again.'
            : `Request failed (${response.status}).`),
      )
    }
    return response.status === 204 ? null : response.json()
  }
  async function load(preferredId = workspaceId) {
    const generation = ++workspaceLoadGeneration
    state = 'loading'
    message = ''
    try {
      const response = await fetch('/api/workspaces')
      if (!response.ok) throw new Error('Could not load your workspaces.')
      const loadedWorkspaces = (await response.json()) as Workspace[]
      if (generation !== workspaceLoadGeneration) return
      const targetWorkspaceId = loadedWorkspaces.some(
        ({ id }) => id === preferredId,
      )
        ? preferredId
        : (loadedWorkspaces[0]?.id ?? '')
      workspaces = loadedWorkspaces
      workspaceId = targetWorkspaceId
      if (targetWorkspaceId) await loadAccounts(targetWorkspaceId)
      if (
        generation !== workspaceLoadGeneration ||
        workspaceId !== targetWorkspaceId
      )
        return
      state = 'ready'
    } catch (error) {
      if (generation !== workspaceLoadGeneration) return
      message = (error as Error).message
      state = 'error'
    }
  }
  async function loadAccounts(targetWorkspaceId = workspaceId) {
    const generation = ++accountLoadGeneration
    ledgerLoadGeneration++
    if (
      targetWorkspaceId !== accountsWorkspaceId &&
      workspaceId === targetWorkspaceId
    ) {
      accounts = []
      categories = []
      convertedBalances = null
      workspaceForecast = null
      selectedId = ''
      transactions = []
      transfers = []
      balanceChecks = []
      corrections = []
      insightsVersion++
    }
    const [loadedAccounts, loadedCategories] = await Promise.all([
      api(`/workspaces/${targetWorkspaceId}/accounts`) as Promise<Account[]>,
      api(`/workspaces/${targetWorkspaceId}/categories`) as Promise<Category[]>,
    ])
    if (
      generation !== accountLoadGeneration ||
      workspaceId !== targetWorkspaceId
    )
      return
    accounts = loadedAccounts
    categories = loadedCategories
    accountsWorkspaceId = targetWorkspaceId
    void Promise.all([
      api('/rates/status') as Promise<RateStatus>,
      api(
        `/workspaces/${targetWorkspaceId}/balances/converted`,
      ) as Promise<ConvertedBalances>,
    ])
      .then(([loadedRateStatus, loadedConvertedBalances]) => {
        if (
          generation === accountLoadGeneration &&
          workspaceId === targetWorkspaceId
        ) {
          rateStatus = loadedRateStatus
          convertedBalances = loadedConvertedBalances
        }
      })
      .catch(() => undefined)
    void (
      api(
        `/workspaces/${targetWorkspaceId}/forecast`,
      ) as Promise<WorkspaceForecast>
    )
      .then((loadedWorkspaceForecast) => {
        if (
          generation === accountLoadGeneration &&
          workspaceId === targetWorkspaceId
        )
          workspaceForecast = loadedWorkspaceForecast
      })
      .catch(() => undefined)
    const targetAccountId = loadedAccounts.some(
      (account) => account.id === selectedId,
    )
      ? selectedId
      : (loadedAccounts.find((account) => !account.archivedAt)?.id ??
        loadedAccounts[0]?.id ??
        '')
    selectedId = targetAccountId
    await loadLedger(targetWorkspaceId, targetAccountId)
    if (
      generation !== accountLoadGeneration ||
      workspaceId !== targetWorkspaceId
    )
      return
    insightsVersion++
  }
  function chooseWorkspace(targetWorkspaceId: string) {
    workspaceLoadGeneration++
    void loadAccounts(targetWorkspaceId)
  }
  async function loadPickerAccounts() {
    pickerAccounts = (
      await Promise.all(
        workspaces.map(async (workspace) =>
          (
            (await api(`/workspaces/${workspace.id}/accounts`)) as Account[]
          ).map((account) => ({
            ...account,
            workspaceId: workspace.id,
            workspaceLabel: `${workspace.name} (${workspace.type === 'household' ? 'Household' : 'Personal'})`,
          })),
        ),
      )
    ).flat()
  }
  async function createHousehold(event: SubmitEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    message = ''
    try {
      const created = await api('/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          reportingCurrency: String(
            data.get('reportingCurrency') ?? '',
          ).toUpperCase(),
        }),
      })
      form.reset()
      workspaces = [...workspaces, created]
      workspaceId = created.id
      workspaceLoadGeneration++
      await loadAccounts(created.id)
    } catch (error) {
      message = (error as Error).message
    }
  }
  async function loadRecoverable() {
    try {
      recoverable = await api('/workspaces/recoverable')
    } catch (error) {
      message = (error as Error).message
    }
  }
  async function restoreWorkspace(workspace: Workspace) {
    try {
      await api(`/workspaces/${workspace.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version: workspace.version }),
      })
      await load(workspace.id)
      await loadRecoverable()
    } catch (error) {
      message = (error as Error).message
    }
  }
  async function checkDeletion() {
    try {
      deletionBlockers = (await api('/account/deletion-preflight'))
        .blockingHouseholds
    } catch (error) {
      message = (error as Error).message
    }
  }
  async function deleteAccount(event: SubmitEvent) {
    event.preventDefault()
    const data = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await api('/account/delete', {
        method: 'POST',
        body: JSON.stringify({
          password: String(data.get('password') ?? ''),
          confirmation: String(data.get('confirmation') ?? ''),
        }),
      })
      location.href = '/sign-in'
    } catch (error) {
      message = (error as Error).message
    }
  }
  async function loadLedger(
    targetWorkspaceId = workspaceId,
    targetAccountId = selectedId,
  ) {
    const generation = ++ledgerLoadGeneration
    if (!targetAccountId) {
      if (
        generation !== ledgerLoadGeneration ||
        workspaceId !== targetWorkspaceId
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
      workspaceId !== targetWorkspaceId ||
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
    await loadLedger(workspaceId, id)
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
        `/workspaces/${workspaceId}/accounts${editingAccount ? `/${editingAccount.id}` : ''}`,
        { method: editingAccount ? 'PUT' : 'POST', body: JSON.stringify(body) },
      )
      accountOpen = false
      await loadAccounts()
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
          if (!confirm(`Archive ${account.name}?${details}`)) return
        }
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
      await loadAccounts()
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
        ? `/workspaces/${workspaceId}/transactions/${editingTransaction.id}`
        : `/workspaces/${workspaceId}/accounts/${account.id}/transactions`
      await api(path, {
        method: editingTransaction ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      transactionOpen = false
      await loadAccounts()
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
        `/workspaces/${workspaceId}/transactions/${item.id}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({
            version: item.version,
            idempotencyKey: actionIntent.key,
          }),
        },
      )
      actionIntent = null
      await loadAccounts()
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
  const transferDestinations = (sourceId: string) => {
    return pickerAccounts.filter(
      (account) => !account.archivedAt && account.id !== sourceId,
    )
  }
  async function newTransfer() {
    const source = selected()
    if (!source || feeIntent) return
    try {
      await loadPickerAccounts()
    } catch (error) {
      message = (error as Error).message
      return
    }
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
    try {
      await loadPickerAccounts()
    } catch (error) {
      message = (error as Error).message
      return
    }
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
    const source = pickerAccounts.find(
      (account) => account.id === fromAccountId,
    )
    const destination = pickerAccounts.find(
      (account) => account.id === toAccountId,
    )
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
    const source = pickerAccounts.find(
      (item) => item.id === transferForm.fromAccountId,
    )
    const destination = pickerAccounts.find(
      (item) => item.id === transferForm.toAccountId,
    )
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
        feeIntent = {
          path: `/workspaces/${workspaceId}/accounts/${source.id}/transactions`,
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
        `/workspaces/${workspaceId}/transfers${editingTransfer ? `/${editingTransfer.id}` : ''}`,
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
            await loadAccounts()
          } catch (refreshError) {
            message += ` Dashboard refresh also failed: ${(refreshError as Error).message}`
          }
          return
        }
      }
      transferOpen = false
      await loadAccounts()
    } catch (error) {
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
      await api(`/workspaces/${workspaceId}/${entity}/${item.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          version: item.version,
          idempotencyKey: actionIntent.key,
        }),
      })
      actionIntent = null
      await loadAccounts()
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
        `/workspaces/${workspaceId}/balance-checks${editingCheck ? `/${editingCheck.id}` : ''}`,
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
      await loadAccounts()
    } catch (error) {
      transactionError = (error as Error).message
    } finally {
      pending = false
    }
  }
  async function createCorrection(item: BalanceCheck) {
    const difference = item.differenceMinor
    if (!difference || difference === '0' || pending) return
    if (correctionIntent?.checkId !== item.id) {
      correctionIntent = {
        checkId: item.id,
        path: `/workspaces/${workspaceId}/corrections`,
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
      await loadAccounts()
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
      await loadAccounts()
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
      history = await api(`/workspaces/${workspaceId}/${entity}/${id}/history`)
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
  onMount(load)
</script>

<svelte:head><title>Dashboard · Dukat</title></svelte:head>
<main class="mx-auto min-h-screen max-w-7xl p-4 md:p-8">
  <header class="mb-8 flex items-center justify-between">
    <div>
      <p class="text-sm font-medium text-muted-foreground">Dukat</p>
      <h1 class="text-3xl font-bold">Dashboard</h1>
    </div>
    {#if state === 'ready'}<Button onclick={newAccount}>New account</Button
      >{/if}
  </header>
  {#if state === 'loading'}<p aria-live="polite">Loading your dashboard…</p>
  {:else if state === 'error'}<Alert.Root variant="destructive"
      ><Alert.Title>Dashboard unavailable</Alert.Title><Alert.Description
        >{message}</Alert.Description
      ><Button class="mt-3" variant="outline" onclick={() => load()}
        >Try again</Button
      ></Alert.Root
    >
  {:else}
    {#if message}<Alert.Root variant="destructive" class="mb-4"
        ><Alert.Title>Could not save</Alert.Title><Alert.Description
          >{message}</Alert.Description
        >
        <div class="mt-3 flex flex-wrap gap-2">
          {#if correctionIntent}<Button
              variant="outline"
              disabled={pending}
              onclick={retryCorrection}>Retry correction</Button
            ><Button
              variant="outline"
              disabled={pending}
              onclick={abandonCorrection}>Dismiss correction retry</Button
            >{/if}
          {#if feeIntent}<Button
              variant="outline"
              disabled={pending}
              onclick={retryFee}>Retry fee expense</Button
            ><Button variant="outline" disabled={pending} onclick={abandonFee}
              >Dismiss fee retry</Button
            >{/if}
        </div></Alert.Root
      >{/if}
    <Card.Root class="mb-6"
      ><Card.Header
        ><Card.Title>Create a household</Card.Title><Card.Description
          >Share a workspace with household members.</Card.Description
        ></Card.Header
      ><Card.Content
        ><form
          class="flex flex-wrap items-end gap-3"
          onsubmit={createHousehold}
        >
          <div>
            <Label for="new-household-name">Name</Label><Input
              id="new-household-name"
              name="name"
              required
            />
          </div>
          <div>
            <Label for="new-household-currency">Reporting currency</Label><Input
              id="new-household-currency"
              name="reportingCurrency"
              value="USD"
              minlength={3}
              maxlength={3}
              pattern={'[A-Za-z]{3}'}
              required
            />
          </div>
          <Button type="submit">Create household</Button>
        </form></Card.Content
      ></Card.Root
    >
    <div class="mb-6 flex flex-wrap gap-2">
      <Button variant="outline" onclick={loadRecoverable}
        >Recover deleted households</Button
      ><Button variant="outline" onclick={checkDeletion}
        >Account deletion settings</Button
      >
    </div>
    {#if recoverable.length > 0}<Card.Root class="mb-6"
        ><Card.Header><Card.Title>Deleted households</Card.Title></Card.Header
        ><Card.Content
          >{#each recoverable as workspace}<div
              class="flex items-center justify-between border-b py-2"
            >
              <span>{workspace.name}</span><Button
                variant="outline"
                onclick={() => restoreWorkspace(workspace)}>Restore</Button
              >
            </div>{/each}</Card.Content
        ></Card.Root
      >{/if}
    {#if deletionBlockers !== null}<Card.Root class="mb-6"
        ><Card.Header
          ><Card.Title>Delete your account</Card.Title><Card.Description
            >This is permanent. Sole-member households are permanently deleted
            with your account.</Card.Description
          ></Card.Header
        ><Card.Content
          >{#if deletionBlockers.length > 0}<Alert.Root variant="destructive"
              ><Alert.Title>Transfer ownership first</Alert.Title
              ><Alert.Description
                >You are the sole owner of: {deletionBlockers
                  .map(({ name }) => name)
                  .join(', ')}.</Alert.Description
              ></Alert.Root
            >{:else}<form class="space-y-3" onsubmit={deleteAccount}>
              <Label for="account-password">Current password</Label><Input
                id="account-password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
              /><label class="flex gap-2"
                ><input
                  type="checkbox"
                  name="confirmation"
                  value="DELETE"
                  required
                /> I understand my account and sole-member households will be permanently
                deleted.</label
              ><Button type="submit" variant="destructive"
                >Delete my account</Button
              >
            </form>{/if}</Card.Content
        ></Card.Root
      >{/if}
    {#if workspaces.length === 0}<Card.Root
        ><Card.Header
          ><Card.Title>No workspace</Card.Title><Card.Description
            >Create a household to begin.</Card.Description
          ></Card.Header
        ></Card.Root
      >
    {:else}
      <div class="mb-6">
        <Label for="workspace">Workspace</Label><select
          id="workspace"
          class="mt-1 h-9 rounded-md border bg-transparent px-3"
          bind:value={workspaceId}
          onchange={() => chooseWorkspace(workspaceId)}
          >{#each workspaces as workspace}<option value={workspace.id}
              >{workspace.name} — {workspace.type === 'household'
                ? 'Household'
                : 'Personal'}</option
            >{/each}</select
        >
      </div>
      {#if workspaces.find(({ id }) => id === workspaceId)?.type === 'household'}{@const activeWorkspace =
          workspaces.find(({ id }) => id === workspaceId)!}<WorkspaceSettings
          workspace={activeWorkspace}
          onchanged={() => load(activeWorkspace.id)}
        />{/if}
      <ManualRateManager
        {workspaceId}
        onchanged={() => loadAccounts(workspaceId)}
      />
      {#key `${workspaceId}-${insightsVersion}`}
        {#if rateStatus?.stale}<Alert.Root class="mb-6"
            ><Alert.Title>Exchange rates are stale</Alert.Title
            ><Alert.Description
              >The latest cached NBP table is from {rateStatus.latest
                ?.effectiveDate ?? 'an unknown date'}. Cached rates remain in
              use.</Alert.Description
            ></Alert.Root
          >{/if}
        {#if convertedBalances}<Card.Root class="mb-6"
            ><Card.Header
              ><Card.Title>Combined balance</Card.Title><Card.Description
                >Reporting currency: {convertedBalances.reportingCurrency}</Card.Description
              ></Card.Header
            ><Card.Content
              >{#if convertedBalances.totalMinor !== null}<b
                  >{minorToDecimal(
                    convertedBalances.totalMinor,
                    convertedBalances.reportingCurrency,
                  )}
                  {convertedBalances.reportingCurrency}</b
                >{:else}<p class="text-sm text-muted-foreground">
                  A combined total is unavailable because an exchange rate is
                  missing. Original account balances remain available.
                </p>{/if}
              {#if convertedBalances.rates.length}<p
                  class="mt-2 text-xs text-muted-foreground"
                >
                  Rates: {convertedBalances.rates
                    .map(
                      (rate) =>
                        `${rate.currency} ${rate.rateToPln} PLN · ${rate.source}${rate.tableNumber ? ` ${rate.tableNumber}` : ''} · ${rate.effectiveDate}${rate.reason ? ` · ${rate.reason}` : ''}`,
                    )
                    .join('; ')}
                </p>{/if}</Card.Content
            ></Card.Root
          >{/if}
        {#if workspaceForecast}<Card.Root class="mb-6"
            ><Card.Header
              ><Card.Title>12-month workspace forecast</Card.Title
              ><Card.Description
                >Estimated in {workspaceForecast.reportingCurrency ??
                  'reporting currency'} using latest rates.</Card.Description
              ></Card.Header
            ><Card.Content
              >{#if workspaceForecast.endingBalanceMinor !== null && workspaceForecast.reportingCurrency}<b
                  >Projected balance: {minorToDecimal(
                    workspaceForecast.endingBalanceMinor,
                    workspaceForecast.reportingCurrency,
                  )}
                  {workspaceForecast.reportingCurrency}</b
                >
                <p class="mt-1 text-sm text-muted-foreground">
                  {workspaceForecast.occurrences.length} unmatched planned occurrences
                  included.
                </p>{:else}<p class="text-sm text-muted-foreground">
                  The workspace forecast is unavailable because an exchange rate
                  is missing. Account forecasts remain available.
                </p>{/if}</Card.Content
            ></Card.Root
          >{/if}
        <SummarySection
          {accounts}
          api={(path, options) =>
            api(`/workspaces/${workspaceId}/summary${path}`, options)}
        />
      {/key}
      {#key workspaceId}
        <CategoryManager
          {categories}
          api={(path, options) =>
            api(`/workspaces/${workspaceId}/categories${path}`, options)}
          onchanged={loadAccounts}
        />
        <CsvImports
          {accounts}
          {categories}
          api={(path, options) =>
            api(`/workspaces/${workspaceId}/imports${path}`, options)}
          onchanged={loadAccounts}
        />
      {/key}
      {#if accounts.length === 0}<Card.Root
          ><Card.Header
            ><Card.Title>No accounts</Card.Title><Card.Description
              >Add a current, savings, or cash account.</Card.Description
            ></Card.Header
          ><Card.Footer
            ><Button onclick={newAccount}>Create account</Button></Card.Footer
          ></Card.Root
        >
      {:else}<div class="grid gap-6 lg:grid-cols-[280px_1fr]">
          <AccountNavigation {accounts} {selectedId} onselect={choose} />
          <section>
            {#if selected()}{@const account = selected()!}
              <AccountSummary
                {account}
                {pending}
                onedit={editAccount}
                onhistory={() =>
                  showHistory(
                    'accounts',
                    account.id,
                    `${account.name} history`,
                  )}
                onaction={accountAction}
              />
              {#key `${workspaceId}:${account.id}`}<PlanningSection
                  {workspaceId}
                  {account}
                  {api}
                />{/key}
              <TransactionsSection
                {account}
                {transactions}
                {pending}
                onnew={newTransaction}
                onedit={editTransaction}
                onaction={transactionAction}
                onhistory={(item) =>
                  showHistory('transactions', item.id, 'Transaction history')}
              />
              <TransfersSection
                {account}
                {transfers}
                {pending}
                canCreate={!feeIntent}
                onnew={newTransfer}
                onedit={editTransfer}
                onaction={(item, action) =>
                  entityAction('transfers', item, action)}
                onhistory={(item) =>
                  showHistory('transfers', item.id, 'Transfer history')}
              />
              <ReconciliationSection
                {account}
                checks={balanceChecks}
                {corrections}
                {pending}
                onnew={newCheck}
                onedit={editCheck}
                oncorrect={createCorrection}
                oncheckaction={(item, action) =>
                  entityAction('balance-checks', item, action)}
                oncorrectionaction={(item, action) =>
                  entityAction('corrections', item, action)}
                oncheckhistory={(item) =>
                  showHistory(
                    'balance-checks',
                    item.id,
                    'Balance check history',
                  )}
                oncorrectionhistory={(item) =>
                  showHistory('corrections', item.id, 'Correction history')}
              />
            {/if}
          </section>
        </div>{/if}
    {/if}
  {/if}
</main>

<AccountDialog
  bind:open={accountOpen}
  bind:form={accountForm}
  {editingAccount}
  error={accountError}
  {pending}
  {currencies}
  onsubmit={saveAccount}
/>
<TransactionDialog
  bind:open={transactionOpen}
  bind:form={transactionForm}
  {editingTransaction}
  error={transactionError}
  {pending}
  {categories}
  onsubmit={saveTransaction}
/>
<TransferDialog
  bind:open={transferOpen}
  bind:form={transferForm}
  {editingTransfer}
  error={transactionError}
  {pending}
  accounts={pickerAccounts}
  {transferDestinations}
  quote={(input) =>
    api(`/workspaces/${workspaceId}/rates/quote`, {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<{
      available: boolean
      suggestedAmountMinor: string | null
      rates: Array<{
        currency: string
        rateToPln: string
        source: string
        effectiveDate: string
        tableNumber: string | null
      }>
    }>}
  onsubmit={saveTransfer}
/>
<BalanceCheckDialog
  bind:open={checkOpen}
  bind:form={checkForm}
  {editingCheck}
  error={transactionError}
  {pending}
  onsubmit={saveCheck}
/>
<HistoryDialog
  bind:open={historyOpen}
  title={historyTitle}
  {history}
  {changed}
/>
