<script lang="ts">
  import { onMount } from 'svelte'
  import {
    Alert,
    Button,
    Card,
    Checkbox,
    Empty,
    Input,
    Label,
    Separator,
    Sidebar,
    Spinner,
    Tabs,
  } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
  import DashboardSidebar, {
    type AccountTab,
    type DashboardView,
  } from '$lib/components/dashboard/DashboardSidebar.svelte'
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

  let activeView = $state<DashboardView>('overview')
  let accountTab = $state<AccountTab>('activity')

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
  let activeWorkspace = $derived(
    workspaces.find(({ id }) => id === workspaceId) ?? null,
  )
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
  let viewTitle = $derived.by(() => {
    if (activeView === 'account') return selected()?.name ?? 'Account'
    if (activeView === 'categories') return 'Categories'
    if (activeView === 'imports') return 'CSV imports'
    if (activeView === 'rates') return 'Exchange rates'
    if (activeView === 'settings') return 'Settings'
    return 'Overview'
  })
  const load = (id?: string) => workspace.load(id)
  const loadAccounts = (id?: string) => workspace.loadAccounts(id)
  const chooseWorkspace = (id: string) => workspace.chooseWorkspace(id)
  const createHousehold = async (event: SubmitEvent) => {
    await workspace.createHousehold(event)
    if (workspace.workspaceId) activeView = 'settings'
  }
  const loadRecoverable = () => workspace.loadRecoverable()
  const restoreWorkspace = (item: (typeof workspaces)[number]) =>
    workspace.restoreWorkspace(item)
  const checkDeletion = () => workspace.checkDeletion()
  const deleteAccount = (event: SubmitEvent) => workspace.deleteAccount(event)

  function navigate(view: DashboardView) {
    activeView = view
  }

  function openAccountTab(tab: AccountTab) {
    activeView = 'account'
    accountTab = tab
  }

  async function selectAccount(id: string) {
    activeView = 'account'
    accountTab = 'activity'
    await choose(id)
  }

  async function selectWorkspace(id: string) {
    workspace!.workspaceId = id
    activeView = 'overview'
    await chooseWorkspace(id)
  }

  onMount(load)
</script>

{#snippet HouseholdCreation()}
  <Card.Root>
    <Card.Header>
      <Card.Title>Create a household</Card.Title>
      <Card.Description>
        Share accounts and planning with household members.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="flex flex-wrap items-end gap-3" onsubmit={createHousehold}>
        <div>
          <Label for="new-household-name">Name</Label>
          <Input id="new-household-name" name="name" required />
        </div>
        <div>
          <Label for="new-household-currency">Reporting currency</Label>
          <Input
            id="new-household-currency"
            name="reportingCurrency"
            value="USD"
            minlength={3}
            maxlength={3}
            pattern={'[A-Za-z]{3}'}
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {#if pending}<Spinner
              aria-hidden="true"
              data-icon="inline-start"
            />{/if}
          Create household
        </Button>
      </form>
    </Card.Content>
  </Card.Root>
{/snippet}

<svelte:head><title>{viewTitle} · Dukat</title></svelte:head>

{#if dashboardState === 'loading'}
  <main class="min-h-screen bg-sidebar p-6">
    <p aria-live="polite">Loading your dashboard…</p>
  </main>
{:else if dashboardState === 'error'}
  <main class="mx-auto min-h-screen max-w-md p-6">
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Dashboard unavailable</Alert.Title>
      <Alert.Description>{message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={() => load()}
        >Try again</Button
      >
    </Alert.Root>
  </main>
{:else}
  <Sidebar.Provider style="--sidebar-width: 17rem;">
    <DashboardSidebar
      {workspaces}
      {workspaceId}
      {accounts}
      {selectedId}
      {activeView}
      {accountTab}
      onworkspace={(id) => void selectWorkspace(id)}
      onnavigate={navigate}
      onaccounttab={openAccountTab}
      onselectaccount={(id) => void selectAccount(id)}
      onnewaccount={newAccount}
    />
    <Sidebar.Inset class="min-w-0 overflow-hidden">
      <header
        class="flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur"
      >
        <Sidebar.Trigger />
        <Separator orientation="vertical" class="h-4" />
        <div class="flex min-w-0 items-center gap-2 text-sm">
          <span class="hidden text-muted-foreground sm:inline">Dukat</span>
          {#if activeWorkspace}
            <span class="hidden text-muted-foreground sm:inline">/</span>
            <span class="hidden truncate text-muted-foreground sm:inline"
              >{activeWorkspace.name}</span
            >
          {/if}
          <span class="hidden text-muted-foreground sm:inline">/</span>
          <span class="truncate font-medium">{viewTitle}</span>
        </div>
        {#if workspaces.length > 0}
          <Button
            class="ml-auto hidden sm:inline-flex"
            size="sm"
            onclick={newAccount}>New account</Button
          >
        {/if}
      </header>

      <div
        class="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 md:p-6 lg:p-8"
      >
        {#if message}
          <Alert.Root variant="destructive" class="mb-6" role="alert">
            <Alert.Title>Could not save</Alert.Title>
            <Alert.Description>{message}</Alert.Description>
            <div class="mt-3 flex flex-wrap gap-2">
              {#if correctionIntent}
                <Button
                  variant="outline"
                  disabled={pending}
                  onclick={retryCorrection}>Retry correction</Button
                >
                <Button
                  variant="outline"
                  disabled={pending}
                  onclick={abandonCorrection}>Dismiss correction retry</Button
                >
              {/if}
              {#if feeIntent}
                <Button variant="outline" disabled={pending} onclick={retryFee}
                  >Retry fee expense</Button
                >
                <Button
                  variant="outline"
                  disabled={pending}
                  onclick={abandonFee}>Dismiss fee retry</Button
                >
              {/if}
            </div>
          </Alert.Root>
        {/if}

        {#if workspaces.length === 0}
          <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 py-12">
            <Empty.Root class="rounded-xl border bg-card">
              <Empty.Header>
                <Empty.Title>No workspace</Empty.Title>
                <Empty.Description>
                  Create a household to start tracking your finances.
                </Empty.Description>
              </Empty.Header>
            </Empty.Root>
            {@render HouseholdCreation()}
          </div>
        {:else if activeView === 'overview'}
          <section class="flex flex-col gap-6" aria-labelledby="overview-title">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-primary">
                  Financial cockpit
                </p>
                <h1
                  id="overview-title"
                  class="text-3xl font-semibold tracking-tight"
                >
                  Overview
                </h1>
                <p class="mt-1 text-muted-foreground">
                  Current balances, monthly flow, and the next 12 months.
                </p>
              </div>
            </div>

            {#key `${workspaceId}-${insightsVersion}`}
              {#if rateStatus?.stale}
                <Alert.Root>
                  <Alert.Title>Exchange rates are stale</Alert.Title>
                  <Alert.Description>
                    The latest cached NBP table is from {rateStatus.latest
                      ?.effectiveDate ?? 'an unknown date'}. Cached rates remain
                    in use.
                  </Alert.Description>
                </Alert.Root>
              {/if}

              <div class="grid gap-4 md:grid-cols-3">
                <Card.Root>
                  <Card.Header>
                    <Card.Description>Combined balance</Card.Description>
                    <Card.Title class="text-2xl">
                      {#if convertedBalances && convertedBalances.totalMinor !== null}
                        {formatMoney(
                          convertedBalances.totalMinor,
                          convertedBalances.reportingCurrency,
                        )}
                      {:else}—{/if}
                    </Card.Title>
                  </Card.Header>
                  <Card.Content>
                    <p class="text-sm text-muted-foreground">
                      {convertedBalances?.reportingCurrency ??
                        activeWorkspace?.reportingCurrency ??
                        'Reporting currency'}
                    </p>
                  </Card.Content>
                </Card.Root>
                <Card.Root>
                  <Card.Header>
                    <Card.Description>In 12 months</Card.Description>
                    <Card.Title class="text-2xl">
                      {#if workspaceForecast && workspaceForecast.endingBalanceMinor !== null && workspaceForecast.reportingCurrency}
                        {formatMoney(
                          workspaceForecast.endingBalanceMinor,
                          workspaceForecast.reportingCurrency,
                        )}
                      {:else}—{/if}
                    </Card.Title>
                  </Card.Header>
                  <Card.Content>
                    <p class="text-sm text-muted-foreground">
                      Projected workspace balance
                    </p>
                  </Card.Content>
                </Card.Root>
                <Card.Root>
                  <Card.Header>
                    <Card.Description>Planned movements</Card.Description>
                    <Card.Title class="text-2xl">
                      {workspaceForecast?.occurrences.length ?? 0}
                    </Card.Title>
                  </Card.Header>
                  <Card.Content>
                    <p class="text-sm text-muted-foreground">
                      Unmatched items in the forecast
                    </p>
                  </Card.Content>
                </Card.Root>
              </div>

              {#if convertedBalances?.totalMinor === null}
                <Alert.Root>
                  <Alert.Title>Combined balance unavailable</Alert.Title>
                  <Alert.Description>
                    An exchange rate is missing. Original account balances
                    remain available.
                  </Alert.Description>
                </Alert.Root>
              {/if}

              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-xl font-semibold">Accounts</h2>
                  <p class="text-sm text-muted-foreground">
                    {accounts.length}
                    {accounts.length === 1 ? 'account' : 'accounts'}
                    in this workspace
                  </p>
                </div>
                <Button variant="outline" onclick={newAccount}
                  >Add account</Button
                >
              </div>

              {#if accounts.length === 0}
                <Empty.Root class="rounded-xl border bg-card">
                  <Empty.Header>
                    <Empty.Title>No accounts</Empty.Title>
                    <Empty.Description>
                      Add a current, savings, or cash account.
                    </Empty.Description>
                  </Empty.Header>
                  <Empty.Content>
                    <Button onclick={newAccount}>Create account</Button>
                  </Empty.Content>
                </Empty.Root>
              {:else}
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {#each accounts as account (account.id)}
                    <Card.Root>
                      <Card.Header>
                        <Card.Title
                          class="flex items-center justify-between gap-3"
                        >
                          <span class="truncate">{account.name}</span>
                          <span class="text-base">
                            {formatMoney(
                              account.balanceMinor,
                              account.currency,
                            )}
                          </span>
                        </Card.Title>
                        <Card.Description class="capitalize">
                          {account.type} · {account.currency}{account.archivedAt
                            ? ' · Archived'
                            : ''}
                        </Card.Description>
                      </Card.Header>
                      <Card.Footer>
                        <Button
                          variant="outline"
                          size="sm"
                          onclick={() => void selectAccount(account.id)}
                          >View details</Button
                        >
                      </Card.Footer>
                    </Card.Root>
                  {/each}
                </div>
              {/if}

              <SummarySection
                {accounts}
                api={(path, options) =>
                  api(`/workspaces/${workspaceId}/summary${path}`, options)}
              />
            {/key}
          </section>
        {:else if activeView === 'account'}
          {#if selected()}
            {@const account = selected()!}
            <section aria-labelledby="account-title">
              <div class="mb-6">
                <p class="text-sm font-medium text-primary">Account</p>
                <h1
                  id="account-title"
                  class="text-3xl font-semibold tracking-tight"
                >
                  {account.name}
                </h1>
                <p class="mt-1 capitalize text-muted-foreground">
                  {account.type} · {account.currency}
                </p>
              </div>

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

              <Tabs.Root bind:value={accountTab}>
                <Tabs.List aria-label="Account sections">
                  <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
                  <Tabs.Trigger value="planning">Planning</Tabs.Trigger>
                  <Tabs.Trigger value="reconciliation"
                    >Reconciliation</Tabs.Trigger
                  >
                </Tabs.List>
                <Tabs.Content value="activity" class="pt-4">
                  <div class="flex flex-col gap-8">
                    <TransactionsSection
                      {account}
                      {transactions}
                      {pending}
                      onnew={newTransaction}
                      onedit={editTransaction}
                      onaction={transactionAction}
                      onhistory={(item) =>
                        showHistory(
                          'transactions',
                          item.id,
                          'Transaction history',
                        )}
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
                  </div>
                </Tabs.Content>
                <Tabs.Content value="planning">
                  {#key `${workspaceId}:${account.id}`}
                    <PlanningSection {workspaceId} {account} {api} />
                  {/key}
                </Tabs.Content>
                <Tabs.Content value="reconciliation" class="pt-4">
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
                </Tabs.Content>
              </Tabs.Root>
            </section>
          {:else}
            <Empty.Root class="rounded-xl border bg-card">
              <Empty.Header>
                <Empty.Title>No accounts</Empty.Title>
                <Empty.Description>
                  Add an account before recording transactions or plans.
                </Empty.Description>
              </Empty.Header>
              <Empty.Content>
                <Button onclick={newAccount}>Create account</Button>
              </Empty.Content>
            </Empty.Root>
          {/if}
        {:else if activeView === 'categories'}
          <section aria-labelledby="categories-title">
            <div class="mb-6">
              <h1
                id="categories-title"
                class="text-3xl font-semibold tracking-tight"
              >
                Categories
              </h1>
              <p class="mt-1 text-muted-foreground">
                Organize income and spending across this workspace.
              </p>
            </div>
            {#key workspaceId}
              <CategoryManager
                {categories}
                api={(path, options) =>
                  api(`/workspaces/${workspaceId}/categories${path}`, options)}
                onchanged={loadAccounts}
              />
            {/key}
          </section>
        {:else if activeView === 'imports'}
          <section aria-labelledby="imports-title">
            <div class="mb-6">
              <h1
                id="imports-title"
                class="text-3xl font-semibold tracking-tight"
              >
                CSV imports
              </h1>
              <p class="mt-1 text-muted-foreground">
                Review bank data before adding it to an account.
              </p>
            </div>
            {#key workspaceId}
              <CsvImports
                {accounts}
                {categories}
                api={(path, options) =>
                  api(`/workspaces/${workspaceId}/imports${path}`, options)}
                onchanged={loadAccounts}
              />
            {/key}
          </section>
        {:else if activeView === 'rates'}
          <section aria-labelledby="rates-title">
            <div class="mb-6">
              <h1
                id="rates-title"
                class="text-3xl font-semibold tracking-tight"
              >
                Exchange rates
              </h1>
              <p class="mt-1 text-muted-foreground">
                Control how foreign balances convert into the reporting
                currency.
              </p>
            </div>
            <ManualRateManager
              {workspaceId}
              onchanged={() => loadAccounts(workspaceId)}
            />
          </section>
        {:else if activeView === 'settings'}
          <section class="flex flex-col gap-6" aria-labelledby="settings-title">
            <div>
              <h1
                id="settings-title"
                class="text-3xl font-semibold tracking-tight"
              >
                Settings
              </h1>
              <p class="mt-1 text-muted-foreground">
                Manage this workspace, collaboration, and account access.
              </p>
            </div>

            {#if activeWorkspace?.type === 'household'}
              <WorkspaceSettings
                workspace={activeWorkspace}
                onchanged={() => load(activeWorkspace.id)}
              />
            {/if}

            {@render HouseholdCreation()}

            <Card.Root>
              <Card.Header>
                <Card.Title>Recovery and account access</Card.Title>
                <Card.Description>
                  Recover deleted households or review permanent account
                  deletion.
                </Card.Description>
              </Card.Header>
              <Card.Content class="flex flex-wrap gap-2">
                <Button variant="outline" onclick={loadRecoverable}
                  >Recover deleted households</Button
                >
                <Button variant="outline" onclick={checkDeletion}
                  >Account deletion settings</Button
                >
              </Card.Content>
            </Card.Root>

            {#if recoverable.length > 0}
              <Card.Root>
                <Card.Header
                  ><Card.Title>Deleted households</Card.Title></Card.Header
                >
                <Card.Content>
                  {#each recoverable as recoverableWorkspace (recoverableWorkspace.id)}
                    <div
                      class="flex items-center justify-between border-b py-2"
                    >
                      <span>{recoverableWorkspace.name}</span>
                      <Button
                        variant="outline"
                        onclick={() => restoreWorkspace(recoverableWorkspace)}
                        >Restore</Button
                      >
                    </div>
                  {/each}
                </Card.Content>
              </Card.Root>
            {/if}

            {#if deletionBlockers !== null}
              <Card.Root>
                <Card.Header>
                  <Card.Title>Delete your account</Card.Title>
                  <Card.Description>
                    This is permanent. Sole-member households are permanently
                    deleted with your account.
                  </Card.Description>
                </Card.Header>
                <Card.Content>
                  {#if deletionBlockers.length > 0}
                    <Alert.Root variant="destructive">
                      <Alert.Title>Transfer ownership first</Alert.Title>
                      <Alert.Description>
                        You are the sole owner of: {deletionBlockers
                          .map(({ name }) => name)
                          .join(', ')}.
                      </Alert.Description>
                    </Alert.Root>
                  {:else}
                    <form class="flex flex-col gap-3" onsubmit={deleteAccount}>
                      <Label for="account-password">Current password</Label>
                      <Input
                        id="account-password"
                        name="password"
                        type="password"
                        autocomplete="current-password"
                        required
                      />
                      <div class="flex items-start gap-2">
                        <Checkbox
                          id="delete-account-confirmation"
                          name="confirmation"
                          value="DELETE"
                          required
                        />
                        <Label for="delete-account-confirmation">
                          I understand my account and sole-member households
                          will be permanently deleted.
                        </Label>
                      </div>
                      <Button type="submit" variant="destructive"
                        >Delete my account</Button
                      >
                    </form>
                  {/if}
                </Card.Content>
              </Card.Root>
            {/if}
          </section>
        {/if}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}

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
