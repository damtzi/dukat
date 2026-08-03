<script lang="ts">
  /* global SubmitEvent */
  import type { BalanceCheck } from '@dukat/core/ledger'
  import { Alert, Button, Dialog, Input, Label } from '@dukat/ui'
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
          ? 'Edit balance check'
          : 'Add balance check'}</Dialog.Title
      ><Dialog.Description
        >Record an observed balance. This check does not change the account
        balance.</Dialog.Description
      ></Dialog.Header
    >
    <form class="space-y-4" {onsubmit}>
      {#if error}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save balance check</Alert.Title
          ><Alert.Description>{error}</Alert.Description></Alert.Root
        >{/if}
      <div class="space-y-2">
        <Label for="observed-balance">Observed balance</Label><Input
          id="observed-balance"
          inputmode="decimal"
          required
          bind:value={form.amount}
        />
      </div>
      <div class="space-y-2">
        <Label for="check-date">Date</Label><Input
          id="check-date"
          type="date"
          max={todayInWarsaw()}
          required
          bind:value={form.date}
        />
      </div>
      <Dialog.Footer
        ><Button type="submit" disabled={pending}>Save balance check</Button
        ></Dialog.Footer
      >
    </form>
  </Dialog.Content>
</Dialog.Root>
