<script lang="ts">
  import type { CashFlow } from '@dukat/core/csv-import'
  import type { Account } from '@dukat/core/ledger'
  import { Button, Card, Field, Input, Table } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let {
    reporting,
    currencies,
    accounts,
  }: {
    reporting: CashFlow['reporting']
    currencies: CashFlow['currencies']
    accounts: Account[]
  } = $props()

  function categoryKey(categoryId: string | null, categoryName: string) {
    return JSON.stringify([categoryId, categoryName])
  }

  let openCategory = $state('')
  let transactionFilter = $state('')
  let maximum = $derived(
    reporting.spendingCategories.reduce(
      (largest, category) =>
        BigInt(category.amountMinor) > largest
          ? BigInt(category.amountMinor)
          : largest,
      1n,
    ),
  )
  let visibleTransactions = $derived.by(() => {
    const query = transactionFilter.trim().toLowerCase()
    if (!openCategory) return []
    return currencies.flatMap((currency) =>
      currency.groups
        .filter(
          (group) =>
            group.kind === 'expense' &&
            categoryKey(group.categoryId, group.categoryName) === openCategory,
        )
        .flatMap((group) =>
          group.transactions
            .filter(
              (transaction) =>
                !query ||
                transaction.date.includes(query) ||
                (transaction.description ?? '').toLowerCase().includes(query) ||
                (
                  accounts.find(
                    (account) => account.id === transaction.accountId,
                  )?.name ?? ''
                )
                  .toLowerCase()
                  .includes(query),
            )
            .map((transaction) => ({
              ...transaction,
              currency: currency.currency,
            })),
        ),
    )
  })
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Spending categories</Card.Title>
    <Card.Description>
      All categories in {reporting.currency}. Open one to inspect its completed
      transactions.
    </Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-2">
    {#each reporting.spendingCategories as category (`${category.categoryId}:${category.categoryName}`)}
      {@const key = categoryKey(category.categoryId, category.categoryName)}
      <Button
        variant="outline"
        class="relative h-auto w-full justify-between overflow-hidden py-3 text-left"
        aria-expanded={openCategory === key}
        aria-controls={`cash-flow-category-${category.categoryId ?? 'uncategorized'}`}
        onclick={() => {
          openCategory = openCategory === key ? '' : key
          transactionFilter = ''
        }}
      >
        <span
          class="absolute inset-y-0 left-0 bg-muted"
          style:width={`${Number((BigInt(category.amountMinor) * 100n) / maximum)}%`}
          aria-hidden="true"
        ></span>
        <span class="relative">{category.categoryName}</span>
        <strong class="relative"
          >{formatMoney(category.amountMinor, reporting.currency)}</strong
        >
      </Button>
      {#if openCategory === key}
        <div
          id={`cash-flow-category-${category.categoryId ?? 'uncategorized'}`}
          class="flex flex-col gap-3 bg-muted/40 p-3"
        >
          <Field.Field>
            <Field.FieldLabel for="transaction-filter"
              >Filter transactions</Field.FieldLabel
            >
            <Input
              id="transaction-filter"
              placeholder="Date, account, or description"
              bind:value={transactionFilter}
            />
          </Field.Field>
          {#if visibleTransactions.length === 0}
            <p class="text-sm text-muted-foreground">
              No transactions match this filter.
            </p>
          {:else}
            <Table.Root tabindex={0} aria-label="Category transactions">
              <Table.Header>
                <Table.Row>
                  <Table.Head>Date</Table.Head>
                  <Table.Head>Account</Table.Head>
                  <Table.Head>Description</Table.Head>
                  <Table.Head>Original amount</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each visibleTransactions as transaction (transaction.id)}
                  <Table.Row>
                    <Table.Cell>{transaction.date}</Table.Cell>
                    <Table.Cell
                      >{accounts.find(
                        (account) => account.id === transaction.accountId,
                      )?.name ?? 'Archived account'}</Table.Cell
                    >
                    <Table.Cell
                      >{transaction.description || 'No description'}</Table.Cell
                    >
                    <Table.Cell
                      >{formatMoney(
                        transaction.amountMinor,
                        transaction.currency,
                      )}</Table.Cell
                    >
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </div>
      {/if}
    {/each}
  </Card.Content>
</Card.Root>
