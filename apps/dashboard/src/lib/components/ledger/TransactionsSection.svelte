<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { Account, Transaction } from '@dukat/core/ledger'
  import { Button, Card, Table } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
  let {
    account,
    transactions,
    pending,
    onnew,
    onedit,
    onaction,
    onhistory,
  }: {
    account: Account
    transactions: Transaction[]
    pending: boolean
    onnew: () => void
    onedit: (item: Transaction) => void
    onaction: (item: Transaction, action: 'trash' | 'restore') => void
    onhistory: (item: Transaction) => void
  } = $props()
</script>

<div class="mb-3 flex items-center justify-between">
  <h2 class="text-xl font-semibold">Transactions</h2>
  {#if !account.archivedAt}<Button onclick={onnew}>Add transaction</Button>{/if}
</div>
{#if transactions.length === 0}<Card.Root
    ><Card.Content class="py-8 text-center text-muted-foreground"
      >No transactions yet.</Card.Content
    ></Card.Root
  >
{:else}
  <div class="space-y-3 md:hidden">
    {#each transactions as item}<Card.Root
        class={item.trashedAt ? 'opacity-60' : ''}
        ><Card.Header
          ><div class="flex justify-between">
            <div>
              <Card.Title class="text-base"
                >{item.description || 'No description'}</Card.Title
              ><Card.Description>{item.date}</Card.Description>
            </div>
            <strong class:text-destructive={item.kind === 'expense'}
              >{item.kind === 'expense' ? '−' : '+'}{formatMoney(
                item.amountMinor,
                account.currency,
              )}</strong
            >
          </div></Card.Header
        ><Card.Footer class="flex flex-wrap gap-2"
          >{@render Actions(
            item,
            account,
            pending,
            onedit,
            onaction,
            onhistory,
          )}</Card.Footer
        ></Card.Root
      >{/each}
  </div>
  <div class="hidden md:block">
    <Table.Root
      ><Table.Header
        ><Table.Row
          ><Table.Head>Date</Table.Head><Table.Head>Description</Table.Head
          ><Table.Head>Kind</Table.Head><Table.Head class="text-right"
            >Amount</Table.Head
          ><Table.Head><span class="sr-only">Actions</span></Table.Head
          ></Table.Row
        ></Table.Header
      ><Table.Body
        >{#each transactions as item}<Table.Row
            class={item.trashedAt ? 'opacity-60' : ''}
            ><Table.Cell>{item.date}</Table.Cell><Table.Cell
              >{item.description || '—'}</Table.Cell
            ><Table.Cell class="capitalize">{item.kind}</Table.Cell><Table.Cell
              class="text-right"
              >{item.kind === 'expense' ? '−' : '+'}{formatMoney(
                item.amountMinor,
                account.currency,
              )}</Table.Cell
            ><Table.Cell class="space-x-2 text-right"
              >{@render Actions(
                item,
                account,
                pending,
                onedit,
                onaction,
                onhistory,
              )}</Table.Cell
            ></Table.Row
          >{/each}</Table.Body
      ></Table.Root
    >
  </div>
{/if}

{#snippet Actions(
  item: Transaction,
  account: Account,
  pending: boolean,
  onedit: (item: Transaction) => void,
  onaction: (item: Transaction, action: 'trash' | 'restore') => void,
  onhistory: (item: Transaction) => void,
)}
  <Button size="sm" variant="outline" onclick={() => onhistory(item)}
    >History</Button
  >{#if !account.archivedAt}{#if item.trashedAt}<Button
        size="sm"
        variant="outline"
        disabled={pending}
        onclick={() => onaction(item, 'restore')}>Restore</Button
      >{:else}<Button size="sm" variant="outline" onclick={() => onedit(item)}
        >Edit</Button
      ><Button
        size="sm"
        variant="outline"
        disabled={pending}
        onclick={() => onaction(item, 'trash')}>Trash</Button
      >{/if}{/if}
{/snippet}
