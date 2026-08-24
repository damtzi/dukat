<script lang="ts">
  import { Button, Card, Input, Label, Select } from '@dukat/ui'
  import { minorToDecimal, parseAmount } from '$lib/money'
  import { todayInWarsaw } from '$lib/date'
  import type { Plan, PlanningAccount, PlanSaveInput } from './planning-types'

  let {
    account,
    editing,
    pending,
    onsubmit,
    oncancel,
    onerror,
  }: {
    account: PlanningAccount
    editing: Plan | null
    pending: boolean
    onsubmit: (input: PlanSaveInput) => Promise<void>
    oncancel: () => void
    onerror: (message: string) => void
  } = $props()

  const emptyForm = () => ({
    kind: 'expense' as Plan['kind'],
    amount: '',
    date: todayInWarsaw(),
    effectiveFrom: '',
    status: 'expected' as Plan['status'],
    description: '',
    frequency: 'once' as 'once' | 'weekly' | 'monthly' | 'yearly',
    interval: 1,
    endDate: '',
  })
  let form = $state(emptyForm())
  let loadedEditingKey: string | null = null
  let intentKey = $state(crypto.randomUUID())
  const planKinds = [
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
  ] as const
  const planStatuses = [
    { value: 'expected', label: 'Expected' },
    { value: 'tentative', label: 'Tentative' },
  ] as const
  const frequencies = [
    { value: 'once', label: 'One time' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
  ] as const
  const selectedLabel = (
    options: readonly { value: string; label: string }[],
    value: string,
  ) => options.find((option) => option.value === value)?.label ?? 'Select'

  $effect(() => {
    const editingKey = editing ? `${editing.id}:${editing.version}` : null
    if (editingKey === loadedEditingKey) return
    loadedEditingKey = editingKey
    intentKey = crypto.randomUUID()
    form = editing
      ? {
          kind: editing.kind,
          amount: minorToDecimal(editing.amountMinor, account.currency),
          date: editing.date,
          effectiveFrom: editing.effectiveFrom,
          status: editing.status,
          description: editing.description ?? '',
          frequency: editing.recurrence?.frequency ?? 'once',
          interval: editing.recurrence?.interval ?? 1,
          endDate: editing.recurrence?.endDate ?? '',
        }
      : emptyForm()
  })

  async function save(event: SubmitEvent) {
    event.preventDefault()
    try {
      if (form.frequency !== 'once' && form.endDate && form.endDate < form.date)
        throw new Error(
          'The recurrence end date cannot be before its start date.',
        )
      await onsubmit({
        amountMinor: parseAmount(form.amount, account.currency),
        status: form.status,
        description: form.description.trim() || null,
        idempotencyKey: intentKey,
        ...(editing
          ? {
              version: editing.version,
              ...(editing.recurrence
                ? { effectiveFrom: form.effectiveFrom }
                : {}),
              ...(form.date !== editing.date ? { date: form.date } : {}),
            }
          : {
              accountId: account.id,
              kind: form.kind,
              date: form.date,
              ...(form.frequency === 'once'
                ? {}
                : {
                    recurrence: {
                      frequency: form.frequency,
                      interval: Number(form.interval),
                      ...(form.endDate ? { endDate: form.endDate } : {}),
                    },
                  }),
            }),
      })
    } catch (cause) {
      onerror((cause as Error).message)
    }
  }
</script>

<Card.Root>
  <Card.Header
    ><Card.Title>{editing ? 'Edit base plan' : 'New plan'}</Card.Title
    ><Card.Description
      >{editing
        ? 'Changes apply to the base amount, date, status, and description.'
        : 'Create a one-time or recurring planned transaction.'}</Card.Description
    ></Card.Header
  >
  <Card.Content
    ><form class="grid gap-3 md:grid-cols-3" onsubmit={save}>
      <div>
        <Label for="plan-kind">Type</Label><Select.Root
          type="single"
          bind:value={form.kind}
          disabled={!!editing}
        >
          <Select.Trigger id="plan-kind" class="w-full">
            {selectedLabel(planKinds, form.kind)}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each planKinds as option (option.value)}
                <Select.Item value={option.value} label={option.label}
                  >{option.label}</Select.Item
                >
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <Label for="plan-amount">Amount ({account.currency})</Label><Input
          id="plan-amount"
          inputmode="decimal"
          bind:value={form.amount}
          required
        />
      </div>
      <div>
        <Label for="plan-date">{editing ? 'New date' : 'Start date'}</Label
        ><Input id="plan-date" type="date" bind:value={form.date} required />
      </div>
      {#if editing?.recurrence}<div>
          <Label for="plan-effective-from"
            >Change this occurrence and future</Label
          ><Input
            id="plan-effective-from"
            type="date"
            bind:value={form.effectiveFrom}
            required
          />
        </div>{/if}
      <div>
        <Label for="plan-status">Certainty</Label><Select.Root
          type="single"
          bind:value={form.status}
        >
          <Select.Trigger id="plan-status" class="w-full">
            {selectedLabel(planStatuses, form.status)}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each planStatuses as option (option.value)}
                <Select.Item value={option.value} label={option.label}
                  >{option.label}</Select.Item
                >
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <Label for="plan-repeat">Repeats</Label><Select.Root
          type="single"
          bind:value={form.frequency}
          disabled={!!editing}
        >
          <Select.Trigger id="plan-repeat" class="w-full">
            {selectedLabel(frequencies, form.frequency)}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each frequencies as option (option.value)}
                <Select.Item value={option.value} label={option.label}
                  >{option.label}</Select.Item
                >
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
      {#if form.frequency !== 'once'}<div>
          <Label for="plan-interval">Every (interval)</Label><Input
            id="plan-interval"
            type="number"
            min="1"
            bind:value={form.interval}
            disabled={!!editing}
            required
          />
        </div>
        <div>
          <Label for="plan-end">End date (optional)</Label><Input
            id="plan-end"
            type="date"
            bind:value={form.endDate}
            disabled={!!editing}
          />
        </div>{/if}
      <div class="md:col-span-2">
        <Label for="plan-description">Description</Label><Input
          id="plan-description"
          bind:value={form.description}
          maxlength={500}
        />
      </div>
      <div class="flex items-end gap-2">
        <Button type="submit" disabled={pending}
          >{editing ? 'Save changes' : 'Create plan'}</Button
        >{#if editing}<Button type="button" variant="outline" onclick={oncancel}
            >Cancel edit</Button
          >{/if}
      </div>
    </form></Card.Content
  >
</Card.Root>
