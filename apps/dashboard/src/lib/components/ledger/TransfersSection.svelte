<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { Account, Transfer } from '@dukat/core/ledger'
  import { Button, Card } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
  let {
    account,
    transfers,
    accounts,
    pending,
    canCreate,
    onnew,
    onedit,
    onaction,
    onhistory,
  }: {
    account: Account
    transfers: Transfer[]
    accounts: Account[]
    pending: boolean
    canCreate: boolean
    onnew: () => void
    onedit: (item: Transfer) => void
    onaction: (item: Transfer, action: 'trash' | 'restore') => void
    onhistory: (item: Transfer) => void
  } = $props()
  const accountName = (id: string) =>
    accounts.find((item) => item.id === id)?.name ?? 'Unknown account'
</script>

<div class="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
  <div>
    <h2 class="text-xl font-semibold">Transfers</h2>
    <p class="text-sm text-muted-foreground">
      Account-to-account movements, separate from income and spending.
    </p>
  </div>
  {#if !account.archivedAt && canCreate}<Button onclick={onnew}
      >New transfer</Button
    >{/if}
</div>
{#if transfers.length === 0}<Card.Root
    ><Card.Content class="py-6 text-center text-muted-foreground"
      >No transfers yet.</Card.Content
    ></Card.Root
  >{:else}<div class="space-y-3">
    {#each transfers as item}{@const outgoing =
        item.fromAccountId === account.id}<Card.Root
        class={item.trashedAt ? 'opacity-60' : ''}
        ><Card.Content
          class="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
          ><div>
            <strong
              >{outgoing ? 'Outgoing transfer' : 'Incoming transfer'}</strong
            >
            <p>
              {outgoing ? 'To' : 'From'}
              {accountName(outgoing ? item.toAccountId : item.fromAccountId)} · {item.date}
            </p>
            <p class="text-sm text-muted-foreground">
              {item.description || 'No note'}
            </p>
          </div>
          <strong
            >{outgoing ? '−' : '+'}{formatMoney(
              item.amountMinor,
              account.currency,
            )}</strong
          >
          <div class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onclick={() => onhistory(item)}
              >History</Button
            >{#if !account.archivedAt}{#if item.trashedAt}<Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onclick={() => onaction(item, 'restore')}>Restore</Button
                >{:else}<Button
                  size="sm"
                  variant="outline"
                  onclick={() => onedit(item)}>Edit</Button
                ><Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onclick={() => onaction(item, 'trash')}>Trash</Button
                >{/if}{/if}
          </div></Card.Content
        ></Card.Root
      >{/each}
  </div>{/if}
