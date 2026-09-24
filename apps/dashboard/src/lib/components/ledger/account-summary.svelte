<script lang="ts">
  import type { Account } from '@dukat/core/ledger'
  import { Badge, Button, Card } from '@dukat/ui'
  import { accountTypeLabel, formatAccountBalance } from '$lib/account'
  import { formatDate } from '$lib/i18n'
  import { formatMoney } from '$lib/money'

  let {
    account,
    pending,
    onadjust,
    onedit,
    onhistory,
    onaction,
  }: {
    account: Account
    pending: boolean
    onadjust: () => void
    onedit: (account: Account) => void
    onhistory: () => void
    onaction: (action: 'archive' | 'restore' | 'delete') => void
  } = $props()

  const dateLabel = (date: string) => formatDate(new Date(`${date}T12:00:00Z`))
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
        {#if account.paymentStatus}
          <Badge
            variant={account.paymentStatus === 'overdue'
              ? 'destructive'
              : 'secondary'}
          >
            {account.paymentStatus === 'paid'
              ? 'Statement paid'
              : account.paymentStatus === 'overdue'
                ? 'Payment overdue'
                : 'Payment due'}
          </Badge>
        {/if}
        {#if account.negativeBalance && account.type !== 'credit_card'}<p
            class="text-sm font-medium text-destructive"
          >
            Negative balance
          </p>{/if}
      </div>
    </div></Card.Header
  >
  {#if account.type === 'credit_card'}
    <Card.Content>
      <dl class="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-muted-foreground">Credit limit</dt>
          <dd class="font-medium">
            {account.creditLimitMinor
              ? formatMoney(account.creditLimitMinor, account.currency)
              : 'Not set'}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Statement date</dt>
          <dd class="font-medium">
            {account.statementDate
              ? dateLabel(account.statementDate)
              : 'Not set'}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Payment due date</dt>
          <dd class="font-medium">
            {account.paymentDueDate
              ? dateLabel(account.paymentDueDate)
              : 'Not set'}
          </dd>
        </div>
      </dl>
    </Card.Content>
  {/if}
  <Card.Footer class="flex flex-wrap gap-2">
    {#if !account.archivedAt}<Button onclick={onadjust}>Adjust balance</Button
      >{/if}
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
