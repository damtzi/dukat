<script lang="ts">
  /* global crypto, fetch, confirm, RequestInit, SubmitEvent */
  /* eslint-disable svelte/require-each-key */
  import { onMount } from 'svelte'
  import {
    Alert,
    Badge,
    Button,
    Card,
    Dialog,
    Input,
    Label,
    Select,
    Table,
    Textarea,
  } from '@dukat/ui'
  import { formatMoney, minorToDecimal, parseAmount } from '$lib/money'
  import { todayInWarsaw } from '$lib/date'

  type Workspace = { id: string; name: string; type: string }
  type Account = {
    id: string
    name: string
    type: 'current' | 'savings' | 'cash'
    currency: string
    openingBalanceMinor: string
    balanceMinor: string
    negativeBalance: boolean
    version: number
    archivedAt: string | null
    canDelete: boolean
    canArchive: boolean
    canRestore: boolean
  }
  type Transaction = {
    id: string
    kind: 'income' | 'expense'
    amountMinor: string
    date: string
    description: string | null
    version: number
    trashedAt: string | null
  }
  type HistoryEntry = {
    id: string
    action: string
    actorUserId: string
    createdAt: string
    beforeJson: string | null
    afterJson: string | null
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
  ] as const

  let state: 'loading' | 'ready' | 'unauthenticated' | 'error' = 'loading'
  let workspaces: Workspace[] = []
  let workspaceId = ''
  let accounts: Account[] = []
  let selectedId = ''
  let transactions: Transaction[] = []
  let message = ''
  let accountError = ''
  let transactionError = ''
  let accountOpen = false
  let transactionOpen = false
  let editingAccount: Account | null = null
  let editingTransaction: Transaction | null = null
  let pending = false
  let authMode: 'sign-in' | 'sign-up' = 'sign-in'
  let authError = ''
  let authNotice = ''
  let authForm = { name: '', email: '', password: '' }
  let accountIntentKey = ''
  let transactionIntentKey = ''
  let actionIntent: { name: string; key: string } | null = null
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
      if (response.status === 401) {
        state = 'unauthenticated'
        return
      }
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
  async function submitAuth(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    authError = ''
    authNotice = ''
    pending = true
    try {
      const response = await fetch(`/api/auth/${authMode}/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email.trim(),
          password: authForm.password,
          ...(authMode === 'sign-up'
            ? { name: authForm.name.trim(), callbackURL: '/' }
            : {}),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          body.message || `Authentication failed (${response.status}).`,
        )
      if (authMode === 'sign-up') {
        authNotice = 'Check your email to verify your account, then sign in.'
        authMode = 'sign-in'
        authForm.password = ''
      } else {
        await load()
      }
    } catch (error) {
      authError = (error as Error).message
    } finally {
      pending = false
    }
  }
  function chooseAuthMode(mode: 'sign-in' | 'sign-up') {
    authMode = mode
    authError = ''
    authNotice = ''
  }
  async function loadAccounts() {
    accounts = await api(`/workspaces/${workspaceId}/accounts`)
    if (!accounts.some((a) => a.id === selectedId))
      selectedId =
        accounts.find((a) => !a.archivedAt)?.id ?? accounts[0]?.id ?? ''
    await loadTransactions()
  }
  async function loadTransactions() {
    transactions = selectedId
      ? await api(
          `/workspaces/${workspaceId}/accounts/${selectedId}/transactions?includeTrashed=true`,
        )
      : []
  }
  async function choose(id: string) {
    selectedId = id
    message = ''
    await loadTransactions()
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
  async function showHistory(
    entity: 'accounts' | 'transactions',
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
  {:else if state === 'unauthenticated'}<Card.Root class="max-w-md"
      ><Card.Header
        ><Card.Title
          >{authMode === 'sign-in'
            ? 'Sign in to Dukat'
            : 'Create your account'}</Card.Title
        ><Card.Description
          >{authMode === 'sign-in'
            ? 'Enter your email and password to see your finances.'
            : 'Create an account to start managing your finances.'}</Card.Description
        ></Card.Header
      ><Card.Content
        >{#if authError}<Alert.Root variant="destructive" class="mb-4"
            ><Alert.Title>Could not continue</Alert.Title><Alert.Description
              >{authError}</Alert.Description
            ></Alert.Root
          >{/if}{#if authNotice}<Alert.Root class="mb-4"
            ><Alert.Title>Account created</Alert.Title><Alert.Description
              >{authNotice}</Alert.Description
            ></Alert.Root
          >{/if}
        <form class="space-y-4" onsubmit={submitAuth}>
          {#if authMode === 'sign-up'}<div class="space-y-2">
              <Label for="auth-name">Name</Label><Input
                id="auth-name"
                autocomplete="name"
                bind:value={authForm.name}
                required
              />
            </div>{/if}
          <div class="space-y-2">
            <Label for="auth-email">Email</Label><Input
              id="auth-email"
              type="email"
              autocomplete="email"
              bind:value={authForm.email}
              required
            />
          </div>
          <div class="space-y-2">
            <Label for="auth-password">Password</Label><Input
              id="auth-password"
              type="password"
              autocomplete={authMode === 'sign-in'
                ? 'current-password'
                : 'new-password'}
              minlength={8}
              bind:value={authForm.password}
              required
            />
          </div>
          <Button type="submit" class="w-full" disabled={pending}
            >{pending
              ? 'Please wait…'
              : authMode === 'sign-in'
                ? 'Sign in'
                : 'Create account'}</Button
          >
        </form></Card.Content
      ><Card.Footer class="justify-center text-sm"
        >{#if authMode === 'sign-in'}<span>New to Dukat?</span><Button
            variant="link"
            class="px-2"
            onclick={() => chooseAuthMode('sign-up')}>Create an account</Button
          >{:else}<span>Already have an account?</span><Button
            variant="link"
            class="px-2"
            onclick={() => chooseAuthMode('sign-in')}>Sign in</Button
          >{/if}</Card.Footer
      ></Card.Root
    >
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
        ></Alert.Root
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
          <aside>
            <h2 class="mb-2 font-semibold">Accounts</h2>
            <div class="space-y-2">
              {#each accounts as account}<Button
                  variant={account.id === selectedId ? 'default' : 'outline'}
                  class="h-auto w-full justify-between py-3"
                  onclick={() => choose(account.id)}
                  ><span class="text-left"
                    >{account.name}<small class="block capitalize opacity-75"
                      >{account.type}</small
                    ></span
                  ><span
                    >{formatMoney(
                      account.balanceMinor,
                      account.currency,
                    )}{#if account.archivedAt}<Badge
                        variant="secondary"
                        class="ml-1">Archived</Badge
                      >{/if}</span
                  ></Button
                >{/each}
            </div>
          </aside>
          <section>
            {#if selected()}{@const account = selected()!}<Card.Root
                class="mb-6"
                ><Card.Header
                  ><div
                    class="flex flex-wrap items-start justify-between gap-3"
                  >
                    <div>
                      <Card.Title>{account.name}</Card.Title><Card.Description
                        class="capitalize"
                        >{account.type} · {account.currency}</Card.Description
                      >
                    </div>
                    <div class="text-right">
                      <p class="text-2xl font-bold">
                        {formatMoney(account.balanceMinor, account.currency)}
                      </p>
                      {#if account.negativeBalance}<p
                          class="text-sm font-medium text-destructive"
                        >
                          Negative balance
                        </p>{/if}
                    </div>
                  </div></Card.Header
                ><Card.Footer class="flex flex-wrap gap-2"
                  ><Button
                    variant="outline"
                    onclick={() => editAccount(account)}>Edit account</Button
                  ><Button
                    variant="outline"
                    onclick={() =>
                      showHistory(
                        'accounts',
                        account.id,
                        `${account.name} history`,
                      )}>Account history</Button
                  >{#if account.canRestore}<Button
                      variant="outline"
                      disabled={pending}
                      onclick={() => accountAction('restore')}
                      >Restore account</Button
                    >{/if}{#if account.canArchive}<Button
                      variant="outline"
                      disabled={pending}
                      onclick={() => accountAction('archive')}
                      >Archive account</Button
                    >{/if}{#if account.canDelete && !account.archivedAt}<Button
                      variant="destructive"
                      disabled={pending}
                      onclick={() => accountAction('delete')}
                      >Delete permanently</Button
                    >{/if}</Card.Footer
                ></Card.Root
              >
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-xl font-semibold">Transactions</h2>
                {#if !account.archivedAt}<Button onclick={newTransaction}
                    >Add transaction</Button
                  >{/if}
              </div>
              {#if transactions.length === 0}<Card.Root
                  ><Card.Content class="py-8 text-center text-muted-foreground"
                    >No transactions yet.</Card.Content
                  ></Card.Root
                >{:else}
                <div class="space-y-3 md:hidden">
                  {#each transactions as item}<Card.Root
                      class={item.trashedAt ? 'opacity-60' : ''}
                      ><Card.Header
                        ><div class="flex justify-between">
                          <div>
                            <Card.Title class="text-base"
                              >{item.description ||
                                'No description'}</Card.Title
                            ><Card.Description>{item.date}</Card.Description>
                          </div>
                          <strong
                            class:text-destructive={item.kind === 'expense'}
                            >{item.kind === 'expense' ? '−' : '+'}{formatMoney(
                              item.amountMinor,
                              account.currency,
                            )}</strong
                          >
                        </div></Card.Header
                      ><Card.Footer class="flex flex-wrap gap-2"
                        ><Button
                          size="sm"
                          variant="outline"
                          onclick={() =>
                            showHistory(
                              'transactions',
                              item.id,
                              'Transaction history',
                            )}>History</Button
                        >{#if !account.archivedAt}{#if item.trashedAt}<Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onclick={() => transactionAction(item, 'restore')}
                              >Restore</Button
                            >{:else}<Button
                              size="sm"
                              variant="outline"
                              onclick={() => editTransaction(item)}>Edit</Button
                            ><Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onclick={() => transactionAction(item, 'trash')}
                              >Trash</Button
                            >{/if}{/if}</Card.Footer
                      ></Card.Root
                    >{/each}
                </div>
                <div class="hidden md:block">
                  <Table.Root
                    ><Table.Header
                      ><Table.Row
                        ><Table.Head>Date</Table.Head><Table.Head
                          >Description</Table.Head
                        ><Table.Head>Kind</Table.Head><Table.Head
                          class="text-right">Amount</Table.Head
                        ><Table.Head
                          ><span class="sr-only">Actions</span></Table.Head
                        ></Table.Row
                      ></Table.Header
                    ><Table.Body
                      >{#each transactions as item}<Table.Row
                          class={item.trashedAt ? 'opacity-60' : ''}
                          ><Table.Cell>{item.date}</Table.Cell><Table.Cell
                            >{item.description || '—'}</Table.Cell
                          ><Table.Cell class="capitalize"
                            >{item.kind}</Table.Cell
                          ><Table.Cell class="text-right"
                            >{item.kind === 'expense' ? '−' : '+'}{formatMoney(
                              item.amountMinor,
                              account.currency,
                            )}</Table.Cell
                          ><Table.Cell class="space-x-2 text-right"
                            ><Button
                              size="sm"
                              variant="outline"
                              onclick={() =>
                                showHistory(
                                  'transactions',
                                  item.id,
                                  'Transaction history',
                                )}>History</Button
                            >{#if !account.archivedAt}{#if item.trashedAt}<Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onclick={() =>
                                    transactionAction(item, 'restore')}
                                  >Restore</Button
                                >{:else}<Button
                                  size="sm"
                                  variant="outline"
                                  onclick={() => editTransaction(item)}
                                  >Edit</Button
                                ><Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onclick={() =>
                                    transactionAction(item, 'trash')}
                                  >Trash</Button
                                >{/if}{/if}</Table.Cell
                          ></Table.Row
                        >{/each}</Table.Body
                    ></Table.Root
                  >
                </div>{/if}{/if}
          </section>
        </div>{/if}
    {/if}
  {/if}
</main>

<Dialog.Root bind:open={accountOpen}
  ><Dialog.Content
    ><Dialog.Header
      ><Dialog.Title
        >{editingAccount ? 'Edit account' : 'Create account'}</Dialog.Title
      ><Dialog.Description
        >{editingAccount?.archivedAt
          ? 'Currency and opening balance cannot be changed while this account is archived.'
          : 'Balances use the currency’s standard decimal precision.'}</Dialog.Description
      ></Dialog.Header
    >
    <form class="space-y-4" onsubmit={saveAccount}>
      {#if accountError}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save account</Alert.Title><Alert.Description
            >{accountError}</Alert.Description
          ></Alert.Root
        >{/if}
      <div class="space-y-2">
        <Label for="account-name">Name</Label><Input
          id="account-name"
          required
          maxlength={120}
          bind:value={accountForm.name}
        />
      </div>
      <div class="space-y-2">
        <Label for="account-type">Type</Label><select
          id="account-type"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={accountForm.type}
          ><option value="current">Current</option><option value="savings"
            >Savings</option
          ><option value="cash">Cash</option></select
        >
      </div>
      <div class="space-y-2">
        <Label for="currency">Currency</Label><Select.Root
          type="single"
          bind:value={accountForm.currency}
          disabled={!!editingAccount?.archivedAt}
        >
          <Select.Trigger id="currency" class="w-full"
            ><span>{accountForm.currency}</span></Select.Trigger
          ><Select.Content
            >{#each currencies as currency}<Select.Item value={currency.code}
                >{currency.code} — {currency.name}</Select.Item
              >{/each}</Select.Content
          >
        </Select.Root>
      </div>
      <div class="space-y-2">
        <Label for="opening">Opening balance</Label><Input
          id="opening"
          required
          inputmode="decimal"
          disabled={!!editingAccount?.archivedAt}
          bind:value={accountForm.amount}
        />
      </div>
      <Dialog.Footer
        ><Button type="submit" disabled={pending}>Save account</Button
        ></Dialog.Footer
      >
    </form></Dialog.Content
  ></Dialog.Root
>
<Dialog.Root bind:open={transactionOpen}
  ><Dialog.Content
    ><Dialog.Header
      ><Dialog.Title
        >{editingTransaction
          ? 'Edit transaction'
          : 'Add transaction'}</Dialog.Title
      ><Dialog.Description
        >Record completed income or spending.</Dialog.Description
      ></Dialog.Header
    >
    <form class="space-y-4" onsubmit={saveTransaction}>
      {#if transactionError}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save transaction</Alert.Title
          ><Alert.Description>{transactionError}</Alert.Description></Alert.Root
        >{/if}
      <div class="space-y-2">
        <Label for="kind">Kind</Label><select
          id="kind"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={transactionForm.kind}
          ><option value="expense">Expense</option><option value="income"
            >Income</option
          ></select
        >
      </div>
      <div class="space-y-2">
        <Label for="amount">Amount</Label><Input
          id="amount"
          required
          inputmode="decimal"
          bind:value={transactionForm.amount}
        />
      </div>
      <div class="space-y-2">
        <Label for="date">Date</Label><Input
          id="date"
          required
          type="date"
          max={todayInWarsaw()}
          bind:value={transactionForm.date}
        />
      </div>
      <div class="space-y-2">
        <Label for="description">Description</Label><Textarea
          id="description"
          maxlength={500}
          bind:value={transactionForm.description}
        />
      </div>
      <Dialog.Footer
        ><Button type="submit" disabled={pending}>Save transaction</Button
        ></Dialog.Footer
      >
    </form></Dialog.Content
  ></Dialog.Root
>
<Dialog.Root bind:open={historyOpen}
  ><Dialog.Content class="max-w-3xl"
    ><Dialog.Header
      ><Dialog.Title>{historyTitle}</Dialog.Title><Dialog.Description
        >Changes recorded for this item.</Dialog.Description
      ></Dialog.Header
    >{#if history.length === 0}<p
        class="py-6 text-center text-muted-foreground"
      >
        No history yet.
      </p>{:else}<div class="max-h-[60vh] overflow-auto">
        <Table.Root
          ><Table.Header
            ><Table.Row
              ><Table.Head>Action</Table.Head><Table.Head>Actor</Table.Head
              ><Table.Head>Created</Table.Head><Table.Head
                >What changed</Table.Head
              ></Table.Row
            ></Table.Header
          ><Table.Body
            >{#each history as entry}<Table.Row
                ><Table.Cell class="capitalize">{entry.action}</Table.Cell
                ><Table.Cell>{entry.actorUserId}</Table.Cell><Table.Cell
                  >{entry.createdAt}</Table.Cell
                ><Table.Cell class="max-w-sm whitespace-normal"
                  >{changed(entry)}</Table.Cell
                ></Table.Row
              >{/each}</Table.Body
          ></Table.Root
        >
      </div>{/if}</Dialog.Content
  ></Dialog.Root
>
