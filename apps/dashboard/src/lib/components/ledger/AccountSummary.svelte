<script lang="ts">
  import type { Account } from '@dukat/core/ledger'
  import { Button, Card } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let {
    account,
    pending,
    onedit,
    onhistory,
    onaction,
  }: {
    account: Account
    pending: boolean
    onedit: (account: Account) => void
    onhistory: () => void
    onaction: (action: 'archive' | 'restore' | 'delete') => void
  } = $props()
</script>

<Card.Root>
  <Card.Header
    ><div class="flex flex-wrap items-start justify-between gap-3">
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
  >
  <Card.Footer class="flex flex-wrap gap-2">
    <Button variant="outline" onclick={() => onedit(account)}
      >Edit account</Button
    ><Button variant="outline" onclick={onhistory}>Account history</Button>
    {#if account.canRestore}<Button
        variant="outline"
        disabled={pending}
        onclick={() => onaction('restore')}>Restore account</Button
      >{/if}
    {#if account.canArchive}<Button
        variant="outline"
        disabled={pending}
        onclick={() => onaction('archive')}>Archive account</Button
      >{/if}
    {#if account.canDelete && !account.archivedAt}<Button
        variant="destructive"
        disabled={pending}
        onclick={() => onaction('delete')}>Delete permanently</Button
      >{/if}
  </Card.Footer>
</Card.Root>
