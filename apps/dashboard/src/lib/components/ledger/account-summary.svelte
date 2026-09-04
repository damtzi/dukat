<script lang="ts">
  import type { Account } from '@dukat/core/ledger'
  import { Button, Card } from '@dukat/ui'
  import { accountTypeLabel, formatAccountBalance } from '$lib/account'
  import { formatDate } from '$lib/i18n'
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
          >{accountTypeLabel(account.type)} · {account.currency}</Card.Description
        >
        <Card.Description>
          {account.type === 'credit_card'
            ? BigInt(account.openingBalanceMinor) > 0n
              ? 'Opened with card credit'
              : 'Opened owing'
            : 'Opened with'}
          {formatMoney(
            account.type === 'credit_card' &&
              BigInt(account.openingBalanceMinor) <= 0n
              ? (-BigInt(account.openingBalanceMinor)).toString()
              : account.openingBalanceMinor,
            account.currency,
          )} on {formatDate(new Date(`${account.openingDate}T12:00:00Z`))}
        </Card.Description>
      </div>
      <div class="text-right">
        <p class="text-2xl font-bold">
          {formatAccountBalance(account)}
        </p>
        {#if account.negativeBalance && account.type !== 'credit_card'}<p
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
