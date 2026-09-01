<script lang="ts">
  import { Button, Card, Field, Input } from '@dukat/ui'
  import { cashFlowRange, type CashFlowPreset, type DateRange } from '$lib/date'

  let {
    preset = $bindable(),
    range = $bindable(),
    today,
  }: {
    preset: CashFlowPreset
    range: DateRange
    today: string
  } = $props()

  const options: Array<[CashFlowPreset, string]> = [
    ['month', 'Current month'],
    ['3m', '3 months'],
    ['6m', '6 months'],
    ['12m', '12 months'],
    ['ytd', 'Year to date'],
    ['custom', 'Custom range'],
  ]

  function selectPreset(value: CashFlowPreset) {
    preset = value
    if (value !== 'custom') range = cashFlowRange(value, today)
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Period</Card.Title>
    <Card.Description>Choose a common period or exact dates.</Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2" aria-label="Cash flow period">
      {#each options as option (option[0])}
        <Button
          variant={preset === option[0] ? 'default' : 'outline'}
          aria-pressed={preset === option[0]}
          onclick={() => selectPreset(option[0])}>{option[1]}</Button
        >
      {/each}
    </div>
    {#if preset === 'custom'}
      <Field.FieldGroup class="grid sm:grid-cols-2">
        <Field.Field>
          <Field.FieldLabel for="cash-flow-start">Start</Field.FieldLabel>
          <Input
            id="cash-flow-start"
            type="date"
            max={range.endDate}
            bind:value={range.startDate}
          />
        </Field.Field>
        <Field.Field>
          <Field.FieldLabel for="cash-flow-end">End</Field.FieldLabel>
          <Input
            id="cash-flow-end"
            type="date"
            min={range.startDate}
            max={today}
            bind:value={range.endDate}
          />
        </Field.Field>
      </Field.FieldGroup>
    {/if}
  </Card.Content>
</Card.Root>
