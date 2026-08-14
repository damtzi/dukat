<script lang="ts">
  import { onMount } from 'svelte'
  import { Alert, Button, Card, Empty, Input, Label, Spinner } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
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
  import {
    api,
    WorkspaceController,
  } from '$lib/controllers/workspace-controller.svelte'
  import { createLedgerController } from '$lib/controllers/ledger-controller.svelte'

  // The controllers depend on each other only through callbacks. Create the
  // ledger first; these callbacks run later, after workspace is assigned.
  let workspace = $state.raw<WorkspaceController>()
  const ledger = createLedgerController({
    getWorkspaceId: () => workspace!.workspaceId,
    getPickerAccounts: () => workspace!.pickerAccounts,
    loadPickerAccounts: () => workspace!.loadPickerAccounts(),
    reloadAccounts: () => workspace!.loadAccounts(),
  })
  workspace = new WorkspaceController({
    getPending: () => ledger.pending,
    setPending: (value) => (ledger.pending = value),
    setMessage: (value) => (ledger.message = value),
    invalidateLedgerRequests: () => ledger.invalidateLedgerRequests(),
    resetWorkspaceData: () => ledger.resetWorkspaceData(),
    applyAccounts: (accounts, categories) =>
      ledger.applyAccounts(accounts, categories),
    chooseAccount: (accounts) => ledger.chooseAccount(accounts),
    loadLedger: (workspaceId, accountId) =>
      ledger.loadLedger(workspaceId, accountId),
    incrementInsightsVersion: () => ledger.incrementInsightsVersion(),
  })
  const currencies = ledger.currencies
  let accounts = $derived(ledger.accounts)
  let categories = $derived(ledger.categories)
  let insightsVersion = $derived(ledger.insightsVersion)
  let selectedId = $derived(ledger.selectedId)
  let transactions = $derived(ledger.transactions)
  let transfers = $derived(ledger.transfers)
  let balanceChecks = $derived(ledger.balanceChecks)
  let corrections = $derived(ledger.corrections)
  let message = $derived(ledger.message)
  let accountError = $derived(ledger.accountError)
  let transactionError = $derived(ledger.transactionError)
  let editingAccount = $derived(ledger.editingAccount)
  let editingTransaction = $derived(ledger.editingTransaction)
  let editingTransfer = $derived(ledger.editingTransfer)
  let editingCheck = $derived(ledger.editingCheck)
  let pending = $derived(ledger.pending)
  let correctionIntent = $derived(ledger.correctionIntent)
  let feeIntent = $derived(ledger.feeIntent)
  let historyTitle = $derived(ledger.historyTitle)
  let history = $derived(ledger.history)
  let dashboardState = $derived(workspace.state)
  let workspaces = $derived(workspace.workspaces)
  let workspaceId = $derived(workspace.workspaceId)
  let rateStatus = $derived(workspace.rateStatus)
  let convertedBalances = $derived(workspace.convertedBalances)
  let workspaceForecast = $derived(workspace.workspaceForecast)
  let pickerAccounts = $derived(workspace.pickerAccounts)
  let recoverable = $derived(workspace.recoverable)
  let deletionBlockers = $derived(workspace.deletionBlockers)
  const {
    selected,
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
  } = ledger
  const load = (id?: string) => workspace.load(id)
  const loadAccounts = (id?: string) => workspace.loadAccounts(id)
  const chooseWorkspace = (id: string) => workspace.chooseWorkspace(id)
  const createHousehold = (event: SubmitEvent) =>
    workspace.createHousehold(event)
  const loadRecoverable = () => workspace.loadRecoverable()
  const restoreWorkspace = (item: (typeof workspaces)[number]) =>
    workspace.restoreWorkspace(item)
  const checkDeletion = () => workspace.checkDeletion()
  const deleteAccount = (event: SubmitEvent) => workspace.deleteAccount(event)
  onMount(load)
</script>

<svelte:head><title>Dashboard · Dukat</title></svelte:head>
<main class="mx-auto min-h-screen max-w-7xl p-4 md:p-8">
  <header class="mb-8 flex items-center justify-between">
    <div>
      <p class="text-sm font-medium text-muted-foreground">Dukat</p>
      <h1 class="text-3xl font-bold">Dashboard</h1>
    </div>
    {#if dashboardState === 'ready'}<Button onclick={newAccount}
        >New account</Button
      >{/if}
  </header>
  {#if dashboardState === 'loading'}<p aria-live="polite">
      Loading your dashboard…
    </p>
  {:else if dashboardState === 'error'}<Alert.Root
      variant="destructive"
      role="alert"
      ><Alert.Title>Dashboard unavailable</Alert.Title><Alert.Description
        >{message}</Alert.Description
      ><Button class="mt-3" variant="outline" onclick={() => load()}
        >Try again</Button
      ></Alert.Root
    >
  {:else}
    {#if message}<Alert.Root variant="destructive" class="mb-4" role="alert"
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
          <Button type="submit" disabled={pending}
            >{#if pending}<Spinner aria-hidden="true" />{/if}Create household</Button
          >
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
          >{#each recoverable as workspace (workspace.id)}<div
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
            >{:else}<form class="flex flex-col gap-3" onsubmit={deleteAccount}>
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
    {#if workspaces.length === 0}<Empty.Root class="rounded-lg border"
        ><Empty.Header
          ><Empty.Title>No workspace</Empty.Title><Empty.Description
            >Create a household to begin.</Empty.Description
          ></Empty.Header
        ></Empty.Root
      >
    {:else}
      <div class="mb-6">
        <Label for="workspace">Workspace</Label><select
          id="workspace"
          class="mt-1 h-9 rounded-md border bg-transparent px-3"
          bind:value={workspace.workspaceId}
          onchange={() => void chooseWorkspace(workspace.workspaceId)}
          >{#each workspaces as workspace (workspace.id)}<option
              value={workspace.id}
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
                  >{formatMoney(
                    convertedBalances.totalMinor,
                    convertedBalances.reportingCurrency,
                  )}</b
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
                  >Projected balance: {formatMoney(
                    workspaceForecast.endingBalanceMinor,
                    workspaceForecast.reportingCurrency,
                  )}</b
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
      {#if accounts.length === 0}<Empty.Root class="rounded-lg border"
          ><Empty.Header
            ><Empty.Title>No accounts</Empty.Title><Empty.Description
              >Add a current, savings, or cash account.</Empty.Description
            ></Empty.Header
          ><Empty.Content
            ><Button onclick={newAccount}>Create account</Button></Empty.Content
          ></Empty.Root
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
  bind:open={ledger.accountOpen}
  bind:form={ledger.accountForm}
  {editingAccount}
  error={accountError}
  {pending}
  {currencies}
  onsubmit={saveAccount}
/>
<TransactionDialog
  bind:open={ledger.transactionOpen}
  bind:form={ledger.transactionForm}
  {editingTransaction}
  error={transactionError}
  {pending}
  {categories}
  onsubmit={saveTransaction}
/>
<TransferDialog
  bind:open={ledger.transferOpen}
  bind:form={ledger.transferForm}
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
  bind:open={ledger.checkOpen}
  bind:form={ledger.checkForm}
  {editingCheck}
  error={transactionError}
  {pending}
  onsubmit={saveCheck}
/>
<HistoryDialog
  bind:open={ledger.historyOpen}
  title={historyTitle}
  {history}
  {changed}
/>
