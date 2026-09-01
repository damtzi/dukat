<script lang="ts">
  import { Button, Input, Label } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
  import { todayInWarsaw } from '$lib/date'
  import type { Occurrence, Plan, Suggestion } from './planning-types'

  let {
    item,
    plan,
    currency,
    pending,
    readonly,
    rescheduleDate,
    suggestions,
    suggestionsLoading,
    suggestionsError,
    onaction,
    onrescheduleDate,
    onfindSuggestions,
    onmatch,
  }: {
    item: Occurrence
    plan?: Plan
    currency: string
    pending: boolean
    readonly: boolean
    rescheduleDate: string
    suggestions: Suggestion[] | null
    suggestionsLoading: boolean
    suggestionsError: string
    onaction: (
      item: Occurrence,
      action: 'skip' | 'restore' | 'reschedule',
      date?: string,
    ) => Promise<void>
    onrescheduleDate: (value: string) => void
    onfindSuggestions: () => Promise<void>
    onmatch: (item: Occurrence, suggestion: Suggestion) => Promise<void>
  } = $props()

  const displayDate = () =>
    item.originalDate < todayInWarsaw() && item.date === todayInWarsaw()
      ? `Due today (overdue from ${item.originalDate})`
      : item.date

  async function match(suggestion: Suggestion) {
    if (
      BigInt(suggestion.transaction.amountMinor) !== BigInt(item.amountMinor) &&
      !confirm(
        'This transaction amount differs from the planned amount. Confirm this match anyway?',
      )
    )
      return
    await onmatch(item, suggestion)
  }
</script>

<article class:border-dashed={item.status === 'tentative'} class="inset-panel">
  <div class="flex flex-wrap justify-between gap-2">
    <div>
      <span class="mr-2 rounded-full bg-muted px-2 py-1 text-xs font-medium"
        >{item.status}</span
      ><strong
        >{plan?.description ||
          (item.kind === 'income'
            ? 'Planned income'
            : 'Planned expense')}</strong
      >
      <p class="mt-1 text-sm">
        {displayDate()} · {item.kind === 'expense' ? '−' : '+'}{formatMoney(
          item.amountMinor,
          currency,
        )}{item.date !== item.originalDate
          ? ` · rescheduled from ${item.originalDate}`
          : ''}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onclick={() => onaction(item, 'skip')}
        disabled={pending || readonly}>Skip</Button
      ><Button
        size="sm"
        variant="outline"
        onclick={() => onaction(item, 'restore')}
        disabled={pending || readonly}>Restore</Button
      ><Button
        size="sm"
        variant="outline"
        onclick={onfindSuggestions}
        disabled={suggestionsLoading || readonly}
        >{suggestionsLoading ? 'Loading matches…' : 'Suggested matches'}</Button
      >
    </div>
  </div>
  <div class="mt-3 flex flex-wrap items-end gap-2">
    <div>
      <Label for={`move-${item.planId}-${item.originalDate}`}>New date</Label
      ><Input
        id={`move-${item.planId}-${item.originalDate}`}
        type="date"
        value={rescheduleDate}
        oninput={(event) => onrescheduleDate(event.currentTarget.value)}
        disabled={readonly}
      />
    </div>
    <Button
      size="sm"
      variant="outline"
      onclick={() => onaction(item, 'reschedule', rescheduleDate)}
      disabled={pending || readonly}>Reschedule</Button
    >
  </div>
  {#if suggestionsError}<p class="mt-3 text-sm text-destructive" role="alert">
      Could not load suggestions: {suggestionsError}
    </p>{/if}
  {#if suggestions}<div class="mt-3 border-t pt-3">
      <p class="mb-2 text-sm font-medium">Confirm a transaction match</p>
      {#if suggestions.length === 0}<p class="text-sm text-muted-foreground">
          No eligible transactions found.
        </p>{/if}{#each suggestions as suggestion (suggestion.transaction.id)}<div
          class="flex flex-wrap items-center justify-between gap-2 py-1 text-sm"
        >
          <span
            >{suggestion.transaction.date} · {suggestion.transaction
              .description || 'Transaction'} · {formatMoney(
              String(suggestion.transaction.amountMinor),
              currency,
            )}
            {BigInt(suggestion.transaction.amountMinor) !==
            BigInt(item.amountMinor)
              ? '⚠ Amount mismatch'
              : ''}</span
          ><Button
            size="sm"
            onclick={() => match(suggestion)}
            disabled={pending || readonly}>Confirm match</Button
          >
        </div>{/each}
    </div>{/if}
</article>
