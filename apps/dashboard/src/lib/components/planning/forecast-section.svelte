<script lang="ts">
  import { Button, Card, Checkbox, Label } from '@dukat/ui'
  import { formatMoney, minorToDecimal } from '$lib/money'
  import OccurrenceCard from './occurrence-card.svelte'
  import type { Forecast, Occurrence, Plan, Suggestion } from './planning-types'

  let {
    forecast,
    plans,
    currency,
    loading,
    pending,
    readonly,
    includeTentative,
    onincludeTentative,
    onaction,
    onsuggestions,
    onmatch,
    onunmatch,
  }: {
    forecast: Forecast | null
    plans: Plan[]
    currency: string
    loading: boolean
    pending: boolean
    readonly: boolean
    includeTentative: boolean
    onincludeTentative: (include: boolean) => void
    onaction: (
      item: Occurrence,
      action: 'skip' | 'restore' | 'reschedule',
      changes?: { date: string; amount: string },
    ) => Promise<void>
    onsuggestions: (item: Occurrence) => Promise<Suggestion[]>
    onmatch: (item: Occurrence, suggestion: Suggestion) => Promise<void>
    onunmatch: (item: Occurrence) => Promise<void>
  } = $props()

  const planFor = (id: string) => plans.find((plan) => plan.id === id)
  const occurrenceKey = (item: Occurrence) =>
    `${item.accountId}:${item.planId}:${item.originalDate}:${item.date}`
  let drafts = $state<
    Record<
      string,
      {
        date: string
        amount: string
        sourceDate: string
        sourceAmount: string
        dirty: boolean
      }
    >
  >({})
  let suggestionState = $state<
    Record<
      string,
      { loading: boolean; error: string; items: Suggestion[] | null }
    >
  >({})

  $effect(() => {
    if (!forecast) return
    let changed = false
    const next = { ...drafts }
    for (const item of forecast.occurrences) {
      const key = occurrenceKey(item)
      const draft = next[key]
      if (
        !draft ||
        (!draft.dirty &&
          (draft.sourceDate !== item.date ||
            draft.sourceAmount !== item.amountMinor))
      ) {
        next[key] = {
          date: item.date,
          amount: minorToDecimal(item.amountMinor, currency),
          sourceDate: item.date,
          sourceAmount: item.amountMinor,
          dirty: false,
        }
        changed = true
      }
    }
    if (changed) drafts = next
  })

  function changeDraft(item: Occurrence, value: string) {
    const current = drafts[occurrenceKey(item)]
    drafts = {
      ...drafts,
      [occurrenceKey(item)]: {
        date: value,
        amount: current?.amount ?? minorToDecimal(item.amountMinor, currency),
        sourceDate: item.date,
        sourceAmount: item.amountMinor,
        dirty: true,
      },
    }
  }

  function changeAmount(item: Occurrence, amount: string) {
    const current = drafts[occurrenceKey(item)]
    drafts = {
      ...drafts,
      [occurrenceKey(item)]: {
        date: current?.date ?? item.date,
        amount,
        sourceDate: item.date,
        sourceAmount: item.amountMinor,
        dirty: true,
      },
    }
  }

  async function findSuggestions(item: Occurrence) {
    const key = occurrenceKey(item)
    suggestionState = {
      ...suggestionState,
      [key]: {
        loading: true,
        error: '',
        items: suggestionState[key]?.items ?? null,
      },
    }
    try {
      const items = await onsuggestions(item)
      suggestionState = {
        ...suggestionState,
        [key]: { loading: false, error: '', items },
      }
    } catch (cause) {
      suggestionState = {
        ...suggestionState,
        [key]: {
          loading: false,
          error: (cause as Error).message,
          items: suggestionState[key]?.items ?? null,
        },
      }
    }
  }
</script>

<Card.Root
  ><Card.Header
    ><div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Card.Title>Upcoming repeats</Card.Title><Card.Description
          >Due entries post automatically. Projected balance: {forecast
            ? formatMoney(forecast.endingBalanceMinor, currency)
            : '—'}</Card.Description
        >
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="include-tentative"
          checked={includeTentative}
          onCheckedChange={onincludeTentative}
        />
        <Label for="include-tentative">Include tentative scenario</Label>
      </div>
    </div></Card.Header
  ><Card.Content>
    {#if loading}<p aria-live="polite">
        Loading forecast…
      </p>{:else if !forecast?.occurrences.length}<p
        class="text-sm text-muted-foreground"
      >
        No upcoming recurring entries in the next 12 months.
      </p>{:else}<div class="flex flex-col gap-3">
        {#each forecast.occurrences as item (`${item.planId}:${item.originalDate}`)}<OccurrenceCard
            {item}
            plan={planFor(item.planId)}
            rescheduleDate={drafts[occurrenceKey(item)]?.date ?? item.date}
            editAmount={drafts[occurrenceKey(item)]?.amount ??
              minorToDecimal(item.amountMinor, currency)}
            suggestions={suggestionState[occurrenceKey(item)]?.items ?? null}
            suggestionsLoading={suggestionState[occurrenceKey(item)]?.loading ??
              false}
            suggestionsError={suggestionState[occurrenceKey(item)]?.error ?? ''}
            {currency}
            {pending}
            {readonly}
            {onaction}
            onrescheduleDate={(value) => changeDraft(item, value)}
            oneditAmount={(value) => changeAmount(item, value)}
            onfindSuggestions={() => findSuggestions(item)}
            {onmatch}
          />{/each}
      </div>{/if}
    {#if forecast?.matchedOccurrences.length}<div
        class="mt-6 flex flex-col gap-3"
      >
        <h3 class="font-semibold">Completed repeats</h3>
        {#each forecast.matchedOccurrences as matched (`${matched.occurrence.planId}:${matched.occurrence.originalDate}`)}<article
            class="inset-panel flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <strong
                >{planFor(matched.occurrence.planId)?.description ||
                  'Planned transaction'}</strong
              >
              <p class="text-sm text-muted-foreground">
                Planned {matched.occurrence.originalDate} · matched to {matched
                  .transaction.date} · {matched.transaction.description ||
                  'Transaction'} · {formatMoney(
                  matched.transaction.amountMinor,
                  currency,
                )}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={pending}
              onclick={() => onunmatch(matched.occurrence)}>Unmatch</Button
            >
          </article>{/each}
      </div>{/if}
  </Card.Content></Card.Root
>
