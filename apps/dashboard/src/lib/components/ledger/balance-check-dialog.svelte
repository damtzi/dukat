<script lang="ts">
  import type { BalanceCheck } from '@dukat/core/ledger'
  import { Alert, Button, Dialog, Field, Input } from '@dukat/ui'
  import { todayInWarsaw } from '$lib/date'

  let {
    open = $bindable(),
    form = $bindable(),
    editingCheck,
    error,
    pending,
    onsubmit,
  }: {
    open: boolean
    form: { amount: string; date: string }
    editingCheck: BalanceCheck | null
    error: string
    pending: boolean
    onsubmit: (event: SubmitEvent) => void
  } = $props()
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    ><Dialog.Header
      ><Dialog.Title
        >{editingCheck
          ? 'Edit balance snapshot'
          : 'Add balance snapshot'}</Dialog.Title
      ><Dialog.Description
        >Record an observed balance. This snapshot does not change the account
        balance.</Dialog.Description
      ></Dialog.Header
    >
    <form {onsubmit}>
      <Field.Group>
        {#if error}<Alert.Root variant="destructive"
            ><Alert.Title>Could not save balance snapshot</Alert.Title
            ><Alert.Description>{error}</Alert.Description></Alert.Root
          >{/if}
        <Field.Field>
          <Field.Label for="observed-balance">Observed balance</Field.Label
          ><Input
            id="observed-balance"
            inputmode="decimal"
            required
            bind:value={form.amount}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="check-date">Date</Field.Label><Input
            id="check-date"
            type="date"
            max={todayInWarsaw()}
            required
            bind:value={form.date}
          />
        </Field.Field>
        <Dialog.Footer
          ><Button type="submit" disabled={pending}
            >Save balance snapshot</Button
          ></Dialog.Footer
        >
      </Field.Group>
    </form>
  </Dialog.Content>
</Dialog.Root>
