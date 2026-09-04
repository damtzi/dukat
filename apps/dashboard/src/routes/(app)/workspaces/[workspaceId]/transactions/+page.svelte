<script lang="ts">
  import { resolve } from '$app/paths'
  import {
    Alert,
    Button,
    Card,
    Checkbox,
    Empty,
    Field,
    Input,
    Select,
    Table,
  } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import { formatMoney } from '$lib/money'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const { ledger, workspace } = getWorkspaceDashboardContext()
  let query = $derived(data.filters.query)
  let accountId = $derived(data.filters.accountId)
  let categoryId = $derived(data.filters.categoryId)
  let amountMin = $derived(data.filters.amountMin)
  let amountMax = $derived(data.filters.amountMax)
  let dateFrom = $derived(data.filters.dateFrom)
  let dateTo = $derived(data.filters.dateTo)
  let includeTrashed = $derived(data.filters.includeTrashed)
  let selectedAccount = $derived(
    data.accounts.find(({ id }) => id === accountId),
  )
  const pagePath = resolve('/(app)/workspaces/[workspaceId]/transactions', {
    workspaceId: workspace.workspaceId,
  })
  const accountName = (id: string) =>
    data.accounts.find((account) => account.id === id)?.name ??
    'Unknown account'
  const accountCurrency = (id: string) =>
    data.accounts.find((account) => account.id === id)?.currency ?? 'PLN'
  const categoryName = (id: string | null) =>
    id === 'uncategorized'
      ? 'Uncategorized'
      : id
        ? (data.categories.find((category) => category.id === id)?.name ??
          'Unknown category')
        : 'Uncategorized'
</script>

<svelte:head><title>Transactions · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="transactions-title">
  <PageHeader
    id="transactions-title"
    title="Transactions"
    description="Search completed income and spending in this workspace."
  >
    {#snippet actions()}
      {#if data.accounts.some(({ archivedAt }) => !archivedAt)}
        <Button onclick={() => ledger.newTransaction()}>Add transaction</Button>
      {/if}
    {/snippet}
  </PageHeader>

  <Card.Root>
    <Card.Header>
      <Card.Title>Search and filters</Card.Title>
      <Card.Description
        >Merchant and description search is not case-sensitive.</Card.Description
      >
    </Card.Header>
    <Card.Content>
      <form method="GET" class="flex flex-col gap-4">
        <Field.Group class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field.Field class="md:col-span-2">
            <Field.Label for="transaction-query">Search</Field.Label>
            <Input
              id="transaction-query"
              name="query"
              type="search"
              placeholder="Merchant or description"
              maxlength={200}
              bind:value={query}
            />
          </Field.Field>
          <Field.Field>
            <Field.Label for="transaction-account-filter">Account</Field.Label>
            <Select.Root type="single" bind:value={accountId}>
              <Select.Trigger id="transaction-account-filter" class="w-full">
                {selectedAccount ? selectedAccount.name : 'All accounts'}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  <Select.Item value="" label="All accounts"
                    >All accounts</Select.Item
                  >
                  {#each data.accounts as account (account.id)}
                    <Select.Item value={account.id} label={account.name}>
                      {account.name} · {account.currency}{account.archivedAt
                        ? ' · Archived'
                        : ''}
                    </Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
            <input type="hidden" name="accountId" value={accountId} />
          </Field.Field>
          <Field.Field>
            <Field.Label for="transaction-category-filter">Category</Field.Label
            >
            <Select.Root type="single" bind:value={categoryId}>
              <Select.Trigger id="transaction-category-filter" class="w-full">
                {categoryId ? categoryName(categoryId) : 'All categories'}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  <Select.Item value="" label="All categories"
                    >All categories</Select.Item
                  >
                  <Select.Item value="uncategorized" label="Uncategorized"
                    >Uncategorized</Select.Item
                  >
                  {#each data.categories as category (category.id)}
                    <Select.Item value={category.id} label={category.name}
                      >{category.name}</Select.Item
                    >
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
            <input type="hidden" name="categoryId" value={categoryId} />
          </Field.Field>
          <Field.Field>
            <Field.Label for="amount-min">Minimum amount</Field.Label>
            <Input
              id="amount-min"
              name="amountMin"
              inputmode="decimal"
              placeholder={selectedAccount
                ? selectedAccount.currency
                : 'Select account first'}
              disabled={!selectedAccount}
              bind:value={amountMin}
            />
          </Field.Field>
          <Field.Field>
            <Field.Label for="amount-max">Maximum amount</Field.Label>
            <Input
              id="amount-max"
              name="amountMax"
              inputmode="decimal"
              placeholder={selectedAccount
                ? selectedAccount.currency
                : 'Select account first'}
              disabled={!selectedAccount}
              bind:value={amountMax}
            />
          </Field.Field>
          <Field.Field>
            <Field.Label for="date-from">From date</Field.Label>
            <Input
              id="date-from"
              name="dateFrom"
              type="date"
              bind:value={dateFrom}
            />
          </Field.Field>
          <Field.Field>
            <Field.Label for="date-to">To date</Field.Label>
            <Input id="date-to" name="dateTo" type="date" bind:value={dateTo} />
          </Field.Field>
        </Field.Group>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Field.Field orientation="horizontal">
            <Checkbox id="include-trashed" bind:checked={includeTrashed} />
            <Field.Label for="include-trashed">Include trash</Field.Label>
          </Field.Field>
          {#if includeTrashed}
            <input type="hidden" name="includeTrashed" value="true" />
          {/if}
          <div class="flex gap-2">
            <Button href={pagePath} variant="outline">Clear</Button>
            <Button type="submit">Search</Button>
          </div>
        </div>
      </form>
    </Card.Content>
  </Card.Root>

  {#if data.searchError}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Could not search transactions</Alert.Title>
      <Alert.Description>{data.searchError}</Alert.Description>
    </Alert.Root>
  {:else if data.transactions.length === 0}
    <Empty.Root>
      <Empty.Header>
        <Empty.Title>No matching transactions</Empty.Title>
        <Empty.Description
          >Change or clear the search filters.</Empty.Description
        >
      </Empty.Header>
    </Empty.Root>
  {:else}
    <p class="text-sm text-muted-foreground" aria-live="polite">
      {data.transactions.length}
      {data.transactions.length === 1 ? 'result' : 'results'}
    </p>
    <div class="flex flex-col gap-3 md:hidden">
      {#each data.transactions as item (item.id)}
        <Card.Root class={item.trashedAt ? 'opacity-60' : ''}>
          <Card.Header>
            <Card.Title class="text-base"
              >{item.merchant ||
                item.description ||
                'No description'}</Card.Title
            >
            <Card.Description
              >{item.date} · {accountName(item.accountId)}</Card.Description
            >
            {#if item.merchant && item.description}<Card.Description
                >{item.description}</Card.Description
              >{/if}
          </Card.Header>
          <Card.Content class="flex items-center justify-between gap-3">
            <span>{categoryName(item.categoryId)}</span>
            <strong class:text-destructive={item.kind === 'expense'}>
              {item.kind === 'expense' ? '−' : '+'}{formatMoney(
                item.amountMinor,
                accountCurrency(item.accountId),
              )}
            </strong>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
    <div class="hidden overflow-x-auto md:block">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Date</Table.Head><Table.Head>Merchant</Table.Head
            ><Table.Head>Description</Table.Head>
            <Table.Head>Category</Table.Head><Table.Head>Account</Table.Head
            ><Table.Head>Kind</Table.Head>
            <Table.Head class="text-right">Amount</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.transactions as item (item.id)}
            <Table.Row class={item.trashedAt ? 'opacity-60' : ''}>
              <Table.Cell>{item.date}</Table.Cell><Table.Cell
                >{item.merchant || '—'}</Table.Cell
              >
              <Table.Cell>{item.description || '—'}</Table.Cell><Table.Cell
                >{categoryName(item.categoryId)}</Table.Cell
              >
              <Table.Cell>{accountName(item.accountId)}</Table.Cell><Table.Cell
                class="capitalize">{item.kind}</Table.Cell
              >
              <Table.Cell class="text-right"
                >{item.kind === 'expense' ? '−' : '+'}{formatMoney(
                  item.amountMinor,
                  accountCurrency(item.accountId),
                )}</Table.Cell
              >
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
</section>
