<script lang="ts">
  import { Button, Card } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
  import type { OverviewAttentionItem } from '$lib/overview'

  let {
    items,
    currency,
    forecastPath,
    categorizationPath,
    ratesPath,
    latestRateDate,
  }: {
    items: OverviewAttentionItem[]
    currency: string
    forecastPath: string
    categorizationPath: string
    ratesPath: string
    latestRateDate: string | null
  } = $props()

  let expanded = $state(false)
  let visibleItems = $derived(expanded ? items : items.slice(0, 3))
  let remainingCount = $derived(items.length - 3)
</script>

<section aria-labelledby="needs-attention-title">
  <Card.Root>
    <Card.Header>
      <Card.Title id="needs-attention-title">Needs attention</Card.Title>
      <Card.Description>
        Objective issues with a direct action, ordered by financial urgency.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <ol class="divide-y border-y">
        {#each visibleItems as item (item.kind)}
          <li
            class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              {#if item.kind === 'shortfall'}
                <strong>Projected balance below zero</strong>
                {#if item.scenario === 'expected'}
                  <p class="text-sm text-muted-foreground">
                    Expected plans put the lowest projected balance at
                    {formatMoney(item.balanceMinor, currency)}. This is a
                    projection, not a guaranteed outcome.
                  </p>
                {:else}
                  <p class="text-sm text-muted-foreground">
                    Including Tentative plans creates a possible lowest balance
                    of {formatMoney(item.balanceMinor, currency)}. Expected
                    plans alone stay at or above zero.
                  </p>
                {/if}
              {:else if item.kind === 'overdue'}
                <strong>Overdue planned transactions</strong>
                <p class="text-sm text-muted-foreground">
                  {item.count === 1
                    ? '1 planned transaction is past due and still affects the forecast.'
                    : `${item.count} planned transactions are past due and still affect the forecast.`}
                </p>
              {:else if item.kind === 'missing-rate'}
                <strong>Missing exchange rates</strong>
                <p class="text-sm text-muted-foreground">
                  Combined balance, Cash flow, and Forecast values cannot be
                  calculated. Original-currency values remain available.
                </p>
              {:else if item.kind === 'uncategorized'}
                <strong>Uncategorized transactions</strong>
                <p class="text-sm text-muted-foreground">
                  {item.count} completed {item.count === 1
                    ? 'transaction needs'
                    : 'transactions need'} a category this month.
                </p>
              {:else}
                <strong>Stale exchange rates</strong>
                <p class="text-sm text-muted-foreground">
                  Combined values use cached rates{latestRateDate
                    ? ` from ${latestRateDate}`
                    : ''}.
                </p>
              {/if}
            </div>

            {#if item.kind === 'shortfall'}
              <Button class="self-start" variant="outline" href={forecastPath}
                >Review forecast</Button
              >
            {:else if item.kind === 'overdue'}
              <Button class="self-start" variant="outline" href={forecastPath}
                >Review overdue plans</Button
              >
            {:else if item.kind === 'uncategorized'}
              <Button
                class="self-start"
                variant="outline"
                href={categorizationPath}>Categorize transactions</Button
              >
            {:else}
              <Button class="self-start" variant="outline" href={ratesPath}
                >Review exchange rates</Button
              >
            {/if}
          </li>
        {/each}
      </ol>

      {#if remainingCount > 0}
        <Button
          class="mt-3 px-0"
          variant="link"
          aria-expanded={expanded}
          onclick={() => (expanded = !expanded)}
        >
          {expanded
            ? `Hide ${remainingCount} additional ${remainingCount === 1 ? 'issue' : 'issues'}`
            : `View ${remainingCount} more ${remainingCount === 1 ? 'issue' : 'issues'}`}
        </Button>
      {/if}
    </Card.Content>
  </Card.Root>
</section>
