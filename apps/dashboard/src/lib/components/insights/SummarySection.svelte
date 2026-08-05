<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { Account } from '@dukat/core/ledger'
  import type { Summary } from '@dukat/core/csv-import'
  import { Button, Card, Input, Label } from '@dukat/ui'
  import { calendarMonthRange, shiftCalendarMonth } from '$lib/date'
  import { minorToDecimal } from '$lib/money'
  let {
    accounts,
    api,
  }: {
    accounts: Account[]
    api: (path: string, options?: RequestInit) => Promise<Summary>
  } = $props()
  let range = $state(calendarMonthRange())
  let accountId = $state('')
  let summary: Summary = $state({ currencies: [] })
  let error = $state('')
  let openGroup = $state('')
  let requestGeneration = 0
  async function load(
    request: { startDate: string; endDate: string; accountId: string },
    generation: number,
    requestApi: (path: string, options?: RequestInit) => Promise<Summary>,
  ) {
    try {
      const query = `startDate=${encodeURIComponent(request.startDate)}&endDate=${encodeURIComponent(request.endDate)}${request.accountId ? `&accountId=${encodeURIComponent(request.accountId)}` : ''}`
      const result = await requestApi(`?${query}`)
      if (generation === requestGeneration) {
        summary = result
        error = ''
      }
    } catch (cause) {
      if (generation === requestGeneration) error = (cause as Error).message
    }
  }
  function shift(amount: number) {
    range = shiftCalendarMonth(range.startDate, amount)
  }
  $effect(() => {
    const request = {
      startDate: range.startDate,
      endDate: range.endDate,
      accountId,
    }
    const requestApi = api
    const generation = ++requestGeneration
    void load(request, generation, requestApi)
  })
</script>

<Card.Root class="mb-6"
  ><Card.Header
    ><Card.Title>Summary</Card.Title><Card.Description
      >Income and spending by currency and category. Dates are inclusive.</Card.Description
    ></Card.Header
  ><Card.Content class="space-y-4">
    <div class="flex flex-wrap items-end gap-2">
      <Button
        variant="outline"
        onclick={() => shift(-1)}
        aria-label="Previous month">←</Button
      >
      <div>
        <Label for="summary-start">Start</Label><Input
          id="summary-start"
          type="date"
          bind:value={range.startDate}
        />
      </div>
      <div>
        <Label for="summary-end">End</Label><Input
          id="summary-end"
          type="date"
          bind:value={range.endDate}
        />
      </div>
      <Button variant="outline" onclick={() => shift(1)} aria-label="Next month"
        >→</Button
      >
      <div>
        <Label for="summary-account">Account</Label><select
          id="summary-account"
          class="block h-9 rounded-md border bg-transparent px-3"
          bind:value={accountId}
          ><option value="">All accounts</option
          >{#each accounts as account}<option value={account.id}
              >{account.name}</option
            >{/each}</select
        >
      </div>
    </div>
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    <div class="grid gap-4 md:grid-cols-2">
      {#each summary.currencies as currency}<Card.Root
          ><Card.Header
            ><Card.Title>{currency.currency}</Card.Title></Card.Header
          ><Card.Content
            ><div class="mb-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                Income<br /><b
                  >{minorToDecimal(currency.incomeMinor, currency.currency)}</b
                >
              </div>
              <div>
                Spending<br /><b
                  >{minorToDecimal(
                    currency.spendingMinor,
                    currency.currency,
                  )}</b
                >
              </div>
              <div>
                Uncategorized<br /><b
                  >{minorToDecimal(
                    currency.uncategorizedMinor,
                    currency.currency,
                  )}</b
                >
              </div>
            </div>
            {#each currency.groups as group}{@const groupKey = `${currency.currency}-${group.kind}-${group.categoryId}`}<button
                class="flex w-full justify-between border-t py-2 text-left"
                onclick={() =>
                  (openGroup = openGroup === groupKey ? '' : groupKey)}
                ><span>{group.categoryName} · {group.kind}</span><b
                  >{minorToDecimal(group.amountMinor, currency.currency)}</b
                ></button
              >{#if openGroup === groupKey}<div
                  class="space-y-2 bg-muted/40 p-2 text-sm"
                >
                  {#each group.transactions as transaction}<div>
                      <b>{transaction.date}</b> · {accounts.find(
                        (a) => a.id === transaction.accountId,
                      )?.name ?? 'Account'} · {transaction.description ||
                        'No description'} · {minorToDecimal(
                        transaction.amountMinor,
                        currency.currency,
                      )}
                      {currency.currency}
                    </div>{/each}
                </div>{/if}{/each}</Card.Content
          ></Card.Root
        >{/each}
    </div>
    {#if summary.currencies.length === 0}<p
        class="text-sm text-muted-foreground"
      >
        No transactions in this period.
      </p>{/if}
  </Card.Content></Card.Root
>
