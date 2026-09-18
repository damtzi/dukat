<script lang="ts">
  import { resolve } from '$app/paths'
  import type { MyOverview } from '@dukat/core/overview'
  import { Card } from '@dukat/ui'
  import TransactionCategoryIcon from '$lib/components/ledger/transaction-category-icon.svelte'
  import { formatMoney } from '$lib/money'

  let {
    transactions,
  }: {
    transactions: MyOverview['recentTransactions']
  } = $props()

  function transactionTitle(transaction: (typeof transactions)[number]) {
    return (
      transaction.merchant ||
      transaction.description ||
      (transaction.kind === 'income' ? 'Income' : 'Transaction')
    )
  }

  function dateLabel(date: string) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Recent transactions</Card.Title>
    <Card.Description>Your latest income and expenses.</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if transactions.length > 0}
      <div class="flex flex-col">
        {#each transactions as transaction (transaction.id)}
          <a
            class="flex items-start justify-between gap-4 border-b py-3 first:pt-0 last:border-0 last:pb-0 hover:text-primary"
            href={resolve(
              '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
              {
                workspaceId: transaction.workspaceId,
                accountId: transaction.accountId,
              },
            )}
          >
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex size-9 shrink-0 items-center justify-center bg-muted text-muted-foreground"
                title={transaction.categoryName ?? 'Uncategorized'}
              >
                <TransactionCategoryIcon
                  categoryName={transaction.categoryName}
                  kind={transaction.kind}
                />
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {transactionTitle(transaction)}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {dateLabel(transaction.date)} · {transaction.categoryName ??
                    'Uncategorized'} · {transaction.accountName}
                </p>
              </div>
            </div>
            <span
              class:text-destructive={transaction.kind === 'expense'}
              class="shrink-0 text-sm font-semibold tabular-nums"
            >
              {transaction.kind === 'expense' ? '−' : '+'}{formatMoney(
                transaction.amountMinor,
                transaction.currency,
              )}
            </span>
          </a>
        {/each}
      </div>
    {:else}
      <p class="py-12 text-center text-sm text-muted-foreground">
        No transactions yet.
      </p>
    {/if}
  </Card.Content>
</Card.Root>
