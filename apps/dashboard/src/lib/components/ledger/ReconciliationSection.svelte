<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { Account, BalanceCheck, Correction } from '@dukat/core/ledger'
  import { Button, Card } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
  let {
    account,
    checks,
    corrections,
    pending,
    onnew,
    onedit,
    oncorrect,
    oncheckaction,
    oncorrectionaction,
    oncheckhistory,
    oncorrectionhistory,
  }: {
    account: Account
    checks: BalanceCheck[]
    corrections: Correction[]
    pending: boolean
    onnew: () => void
    onedit: (item: BalanceCheck) => void
    oncorrect: (item: BalanceCheck) => void
    oncheckaction: (item: BalanceCheck, action: 'trash' | 'restore') => void
    oncorrectionaction: (item: Correction, action: 'trash' | 'restore') => void
    oncheckhistory: (item: BalanceCheck) => void
    oncorrectionhistory: (item: Correction) => void
  } = $props()
  const signedMoney = (amount: string, currency: string) =>
    `${amount.startsWith('-') ? '−' : '+'}${formatMoney(amount.startsWith('-') ? amount.slice(1) : amount, currency)}`
</script>

<div class="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
  <div>
    <h2 class="text-xl font-semibold">Balance reconciliation</h2>
    <p class="text-sm text-muted-foreground">
      Checks compare balances but do not alter them.
    </p>
  </div>
  {#if !account.archivedAt}<Button onclick={onnew}>Add balance check</Button
    >{/if}
</div>
{#if checks.length === 0}<Card.Root
    ><Card.Content class="py-6 text-center text-muted-foreground"
      >No balance checks yet.</Card.Content
    ></Card.Root
  >{:else}<div class="space-y-3">
    {#each checks as item}<Card.Root class={item.trashedAt ? 'opacity-60' : ''}
        ><Card.Content class="py-4"
          ><div class="grid gap-2 sm:grid-cols-4">
            <div>
              <span class="text-sm text-muted-foreground">Date</span>
              <p>{item.date}</p>
            </div>
            <div>
              <span class="text-sm text-muted-foreground">Observed</span>
              <p>{formatMoney(item.observedBalanceMinor, account.currency)}</p>
            </div>
            <div>
              <span class="text-sm text-muted-foreground">Calculated</span>
              <p>
                {formatMoney(
                  item.calculatedBalanceMinor ?? '0',
                  account.currency,
                )}
              </p>
            </div>
            <div>
              <span class="text-sm text-muted-foreground">Difference</span>
              <p>
                {signedMoney(item.differenceMinor ?? '0', account.currency)}
              </p>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onclick={() => oncheckhistory(item)}>History</Button
            >{#if !account.archivedAt}{#if item.trashedAt}<Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onclick={() => oncheckaction(item, 'restore')}>Restore</Button
                >{:else}<Button
                  size="sm"
                  variant="outline"
                  onclick={() => onedit(item)}>Edit</Button
                ><Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onclick={() => oncheckaction(item, 'trash')}>Trash</Button
                >{#if item.differenceMinor && item.differenceMinor !== '0'}<Button
                    size="sm"
                    disabled={pending}
                    onclick={() => oncorrect(item)}>Create correction</Button
                  >{/if}{/if}{/if}
          </div></Card.Content
        ></Card.Root
      >{/each}
  </div>{/if}
<div class="mb-3 mt-8">
  <h2 class="text-xl font-semibold">Corrections</h2>
  <p class="text-sm text-muted-foreground">
    Explicit signed balance adjustments, separate from income and spending.
  </p>
</div>
{#if corrections.length === 0}<Card.Root
    ><Card.Content class="py-6 text-center text-muted-foreground"
      >No corrections yet.</Card.Content
    ></Card.Root
  >{:else}<div class="space-y-3">
    {#each corrections as item}<Card.Root
        class={item.trashedAt ? 'opacity-60' : ''}
        ><Card.Content
          class="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
          ><div>
            <strong>{item.description || 'Balance correction'}</strong>
            <p>{item.date}</p>
          </div>
          <strong>{signedMoney(item.amountMinor, account.currency)}</strong>
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onclick={() => oncorrectionhistory(item)}>History</Button
            >{#if !account.archivedAt}<Button
                size="sm"
                variant="outline"
                disabled={pending}
                onclick={() =>
                  oncorrectionaction(
                    item,
                    item.trashedAt ? 'restore' : 'trash',
                  )}>{item.trashedAt ? 'Restore' : 'Trash'}</Button
              >{/if}
          </div></Card.Content
        ></Card.Root
      >{/each}
  </div>{/if}
