<script lang="ts">
  import type { Account, Transfer } from '@dukat/core/ledger'
  import { Button, Card } from '@dukat/ui'
  import SectionHeader from '$lib/components/dashboard/SectionHeader.svelte'
  import { formatMoney } from '$lib/money'
  let {
    account,
    transfers,
    pending,
    canCreate,
    onnew,
    onedit,
    onaction,
    onhistory,
  }: {
    account: Account
    transfers: Transfer[]
    pending: boolean
    canCreate: boolean
    onnew: () => void
    onedit: (item: Transfer) => void
    onaction: (item: Transfer, action: 'trash' | 'restore') => void
    onhistory: (item: Transfer) => void
  } = $props()
  const counterpartyName = (item: Transfer) =>
    item.counterparty.visibility === 'full'
      ? item.counterparty.name
      : item.counterparty.visibility === 'private'
        ? 'Private personal account'
        : 'Deleted account'
</script>

<section class="flex flex-col gap-3" aria-labelledby="transfers-title">
  <SectionHeader
    id="transfers-title"
    title="Transfers"
    description="Account-to-account movements, separate from income and spending."
  >
    {#snippet actions()}
      {#if !account.archivedAt && canCreate}<Button onclick={onnew}
          >New transfer</Button
        >{/if}
    {/snippet}
  </SectionHeader>
  {#if transfers.length === 0}<Card.Root
      ><Card.Content class="py-6 text-center text-muted-foreground"
        >No transfers yet.</Card.Content
      ></Card.Root
    >{:else}<div class="flex flex-col gap-3">
      {#each transfers as item (item.id)}{@const outgoing =
          item.localSide === 'from'}<Card.Root
          class={item.trashedAt ? 'opacity-60' : ''}
          ><Card.Content
            class="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
            ><div>
              <strong
                >{outgoing ? 'Outgoing transfer' : 'Incoming transfer'}</strong
              >
              <p>
                {outgoing ? 'To' : 'From'}
                {counterpartyName(item)} · {item.date}
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
              <Button
                size="sm"
                variant="outline"
                onclick={() => onhistory(item)}>History</Button
              >{#if !account.archivedAt && item.canManage && !item.detachedAt}{#if item.trashedAt}<Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onclick={() => onaction(item, 'restore')}>Restore</Button
                  >{:else}<Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
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
</section>
