<script lang="ts">
  /* global crypto, fetch, confirm, RequestInit, SubmitEvent */
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
  import { Alert, Button, Card, Label } from '@dukat/ui'
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

  type Workspace = { id: string; name: string; type: string }

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
  ] as const

  let state: 'loading' | 'ready' | 'error' = 'loading'
  let workspaces: Workspace[] = []
  let workspaceId = ''
  let accounts: Account[] = []
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
  let actionIntent: { name: string; key: string } | null = null
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
  }
  let transferForm = {
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    date: todayInWarsaw(),
    description: '',
    fee: '',
    feeDescription: '',
  }
  let checkForm = { amount: '', date: todayInWarsaw() }

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
  async function load() {
    state = 'loading'
    message = ''
    try {
      const response = await fetch('/api/workspaces')
      if (!response.ok) throw new Error('Could not load your workspaces.')
      workspaces = ((await response.json()) as Workspace[]).filter(
        (workspace) => workspace.type === 'personal',
      )
      workspaceId = workspaces[0]?.id ?? ''
      if (workspaceId) await loadAccounts()
      state = 'ready'
    } catch (error) {
      message = (error as Error).message
      state = 'error'
    }
  }
  async function loadAccounts() {
    accounts = await api(`/workspaces/${workspaceId}/accounts`)
    if (!accounts.some((a) => a.id === selectedId))
      selectedId =
        accounts.find((a) => !a.archivedAt)?.id ?? accounts[0]?.id ?? ''
    await loadLedger()
  }
  async function loadLedger() {
    if (!selectedId) {
      transactions = []
      transfers = []
      balanceChecks = []
      corrections = []
      return
    }
    const base = `/workspaces/${workspaceId}/accounts/${selectedId}`
    ;[transactions, transfers, balanceChecks, corrections] = await Promise.all([
      api(`${base}/transactions?includeTrashed=true`),
      api(`${base}/transfers?includeTrashed=true`),
      api(`${base}/balance-checks?includeTrashed=true`),
      api(`${base}/corrections?includeTrashed=true`),
    ])
  }
  async function choose(id: string) {
    selectedId = id
    message = ''
    await loadLedger()
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
      await api(`/workspaces/${workspaceId}/accounts/${account.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          version: account.version,
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
  function newTransaction() {
    editingTransaction = null
    transactionError = ''
    transactionIntentKey = key()
    transactionForm = {
      kind: 'expense',
      amount: '',
      date: todayInWarsaw(),
      description: '',
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
    const source = accounts.find((account) => account.id === sourceId)
    return accounts.filter(
      (account) =>
        !account.archivedAt &&
        account.id !== sourceId &&
        account.currency === source?.currency,
    )
  }
  function newTransfer() {
    const source = selected()
    if (!source || feeIntent) return
    editingTransfer = null
    transferIntentKey = key()
    transferForm = {
      fromAccountId: source.id,
      toAccountId: transferDestinations(source.id)[0]?.id ?? '',
      amount: '',
      date: todayInWarsaw(),
      description: '',
      fee: '',
      feeDescription: '',
    }
    transferOpen = true
  }
  function editTransfer(item: Transfer) {
    editingTransfer = item
    transferIntentKey = key()
    transferForm = {
      fromAccountId: item.fromAccountId,
      toAccountId: item.toAccountId,
      amount: minorToDecimal(item.amountMinor, selected()!.currency),
      date: item.date,
      description: item.description ?? '',
      fee: '',
      feeDescription: '',
    }
    transferOpen = true
  }
  async function saveTransfer(event: SubmitEvent) {
    event.preventDefault()
    const source = accounts.find(
      (item) => item.id === transferForm.fromAccountId,
    )
    const destination = accounts.find(
      (item) => item.id === transferForm.toAccountId,
    )
    if (!source || !destination || pending) return
    transactionError = ''
    pending = true
    let transferAcknowledged = false
    try {
      if (
        source.id === destination.id ||
        source.currency !== destination.currency
      )
        throw new Error(
          'Choose a different destination with the same currency.',
        )
      if (transferForm.date > todayInWarsaw())
        throw new Error('Date cannot be in the future.')
      const body = {
        toAccountId: destination.id,
        amountMinor: parseAmount(transferForm.amount, source.currency),
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
      ><Button class="mt-3" variant="outline" onclick={load}>Try again</Button
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
    {#if workspaces.length === 0}<Card.Root
        ><Card.Header
          ><Card.Title>No personal workspace</Card.Title><Card.Description
            >A personal workspace is required to manage your accounts.</Card.Description
          ></Card.Header
        ></Card.Root
      >
    {:else}
      <div class="mb-6">
        <Label for="workspace">Workspace</Label><select
          id="workspace"
          class="mt-1 h-9 rounded-md border bg-transparent px-3"
          bind:value={workspaceId}
          onchange={loadAccounts}
          >{#each workspaces as workspace}<option value={workspace.id}
              >{workspace.name}</option
            >{/each}</select
        >
      </div>
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
                {accounts}
                {transfers}
                {pending}
                canCreate={transferDestinations(account.id).length > 0 &&
                  !feeIntent}
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
  onsubmit={saveTransaction}
/>
<TransferDialog
  bind:open={transferOpen}
  bind:form={transferForm}
  {editingTransfer}
  error={transactionError}
  {pending}
  {accounts}
  {transferDestinations}
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
