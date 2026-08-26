<script lang="ts">
  import type { Account } from '@dukat/core/ledger'
  import { Button, Card, Empty } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let {
    accounts,
    onnew,
    onselect,
  }: {
    accounts: Account[]
    onnew: () => void
    onselect: (id: string) => void
  } = $props()
</script>

{#if accounts.length === 0}
  <Empty.Root class="rounded-xl border bg-card">
    <Empty.Header>
      <Empty.Title>No accounts</Empty.Title>
      <Empty.Description>
        Add a current, savings, or cash account.
      </Empty.Description>
    </Empty.Header>
    <Empty.Content>
      <Button onclick={onnew}>Create account</Button>
    </Empty.Content>
  </Empty.Root>
{:else}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {#each accounts as account (account.id)}
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center justify-between gap-3">
            <span class="truncate">{account.name}</span>
            <span class="text-base">
              {formatMoney(account.balanceMinor, account.currency)}
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
            onclick={() => onselect(account.id)}>View details</Button
          >
        </Card.Footer>
      </Card.Root>
    {/each}
  </div>
{/if}
