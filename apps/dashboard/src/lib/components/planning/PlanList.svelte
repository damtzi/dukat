<script lang="ts">
  import { Button, Card, Input, Label } from '@dukat/ui'
  import { formatMoney } from '$lib/money'
  import { todayInWarsaw } from '$lib/date'
  import type { Plan } from './planning-types'

  let {
    plans,
    currency,
    loading,
    pending,
    onedit,
    onaction,
    onrestore,
  }: {
    plans: Plan[]
    currency: string
    loading: boolean
    pending: boolean
    onedit: (plan: Plan) => void
    onaction: (
      plan: Plan,
      action: 'stop' | 'cancel',
      stopDate?: string,
    ) => Promise<void>
    onrestore: (plan: Plan, originalDate: string) => Promise<void>
  } = $props()

  let restoreDates = $state<Record<string, string>>({})
  let stopDates = $state<Record<string, string>>({})

  async function action(plan: Plan, name: 'stop' | 'cancel') {
    if (
      !confirm(
        name === 'cancel'
          ? 'Cancel this plan and remove all of its occurrences from the forecast?'
          : 'Stop future occurrences of this recurring plan?',
      )
    )
      return
    await onaction(
      plan,
      name,
      name === 'stop' ? (stopDates[plan.id] ?? todayInWarsaw()) : undefined,
    )
  }
</script>

<Card.Root
  ><Card.Header
    ><Card.Title>Base plans</Card.Title><Card.Description
      >Expected plans are solid; tentative plans are shown with a dashed border.</Card.Description
    ></Card.Header
  ><Card.Content class="flex flex-col gap-3">
    {#if loading}<p aria-live="polite">
        Loading plans…
      </p>{:else if plans.length === 0}<p class="text-sm text-muted-foreground">
        No plans for this account yet.
      </p>{/if}
    {#each plans as plan (plan.id)}<article
        class:border-dashed={plan.status === 'tentative'}
        class="rounded-md border p-3 opacity-100"
        class:opacity-60={plan.cancelled}
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span
              class="mr-2 rounded-full bg-muted px-2 py-1 text-xs font-medium"
              >{plan.status}</span
            ><strong
              >{plan.description ||
                (plan.kind === 'income'
                  ? 'Planned income'
                  : 'Planned expense')}</strong
            >
            <p class="mt-1 text-sm">
              {plan.kind === 'expense' ? '−' : '+'}{formatMoney(
                plan.amountMinor,
                currency,
              )} · from {plan.effectiveFrom}{plan.recurrence
                ? ` · cadence anchored ${plan.date}`
                : ''}{plan.recurrence
                ? ` · every ${plan.recurrence.interval} ${plan.recurrence.frequency}${plan.recurrence.endDate ? ` until ${plan.recurrence.endDate}` : ''}`
                : ' · one time'}{plan.cutoffDate
                ? ` · stopped ${plan.cutoffDate}`
                : ''}{plan.cancelled ? ' · cancelled' : ''}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onclick={() => onedit(plan)}
              disabled={pending || plan.cancelled || !!plan.cutoffDate}
              >Edit</Button
            >{#if plan.recurrence && !plan.cutoffDate && !plan.cancelled}<Input
                class="w-auto"
                aria-label="Stop from date"
                type="date"
                value={stopDates[plan.id] ?? todayInWarsaw()}
                oninput={(event) =>
                  (stopDates = {
                    ...stopDates,
                    [plan.id]: event.currentTarget.value,
                  })}
              /><Button
                size="sm"
                variant="outline"
                onclick={() => action(plan, 'stop')}
                disabled={pending}>Stop</Button
              >{/if}{#if !plan.cancelled && !plan.cutoffDate}<Button
                size="sm"
                variant="destructive"
                onclick={() => action(plan, 'cancel')}
                disabled={pending}>Cancel</Button
              >{/if}
          </div>
        </div>
        {#if plan.recurrence && !plan.cancelled}<div
            class="mt-3 flex flex-wrap items-end gap-2"
          >
            <div>
              <Label for={`restore-${plan.id}`}
                >Restore skipped original date</Label
              ><Input
                id={`restore-${plan.id}`}
                type="date"
                value={restoreDates[plan.id] ?? ''}
                oninput={(event) =>
                  (restoreDates = {
                    ...restoreDates,
                    [plan.id]: event.currentTarget.value,
                  })}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onclick={() => onrestore(plan, restoreDates[plan.id] ?? '')}
              disabled={pending}>Restore occurrence</Button
            >
          </div>{/if}
      </article>{/each}
  </Card.Content></Card.Root
>
