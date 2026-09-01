<script lang="ts">
  import type { Account, BalanceCheck, Correction } from '@dukat/core/ledger'
  import { Button, Card } from '@dukat/ui'
  import SectionHeader from '$lib/components/dashboard/SectionHeader.svelte'
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

<div class="flex flex-col gap-8">
  <section class="flex flex-col gap-3" aria-labelledby="reconciliation-title">
    <SectionHeader
      id="reconciliation-title"
      title="Balance reconciliation"
      description="Checks compare balances but do not alter them."
    >
      {#snippet actions()}
        {#if !account.archivedAt}<Button onclick={onnew}
            >Add balance check</Button
          >{/if}
      {/snippet}
    </SectionHeader>
    {#if checks.length === 0}<Card.Root
        ><Card.Content class="py-6 text-center text-muted-foreground"
          >No balance checks yet.</Card.Content
        ></Card.Root
      >{:else}<div class="flex flex-col gap-3">
        {#each checks as item (item.id)}<Card.Root
            class={item.trashedAt ? 'opacity-60' : ''}
            ><Card.Content class="py-4"
              ><div class="grid gap-2 sm:grid-cols-4">
                <div>
                  <span class="text-sm text-muted-foreground">Date</span>
                  <p>{item.date}</p>
                </div>
                <div>
                  <span class="text-sm text-muted-foreground">Observed</span>
                  <p>
                    {formatMoney(item.observedBalanceMinor, account.currency)}
                  </p>
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
                      onclick={() => oncheckaction(item, 'restore')}
                      >Restore</Button
                    >{:else}<Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onclick={() => onedit(item)}>Edit</Button
                    ><Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onclick={() => oncheckaction(item, 'trash')}>Trash</Button
                    >{#if item.differenceMinor && item.differenceMinor !== '0'}<Button
                        size="sm"
                        disabled={pending}
                        onclick={() => oncorrect(item)}
                        >Create correction</Button
                      >{/if}{/if}{/if}
              </div></Card.Content
            ></Card.Root
          >{/each}
      </div>{/if}
  </section>
  <section class="flex flex-col gap-3" aria-labelledby="corrections-title">
    <SectionHeader
      id="corrections-title"
      title="Corrections"
      description="Explicit signed balance adjustments, separate from income and spending."
    />
    {#if corrections.length === 0}<Card.Root
        ><Card.Content class="py-6 text-center text-muted-foreground"
          >No corrections yet.</Card.Content
        ></Card.Root
      >{:else}<div class="flex flex-col gap-3">
        {#each corrections as item (item.id)}<Card.Root
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
  </section>
</div>
