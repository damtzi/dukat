<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { Account } from '@dukat/core/ledger'
  import { Alert, Button, Dialog, Input, Label, Select } from '@dukat/ui'

  let {
    open = $bindable(),
    form = $bindable(),
    editingAccount,
    error,
    pending,
    currencies,
    onsubmit,
  }: {
    open: boolean
    form: {
      name: string
      type: Account['type']
      currency: string
      amount: string
    }
    editingAccount: Account | null
    error: string
    pending: boolean
    currencies: readonly { code: string; name: string }[]
    onsubmit: (event: SubmitEvent) => void
  } = $props()
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    ><Dialog.Header
      ><Dialog.Title
        >{editingAccount ? 'Edit account' : 'Create account'}</Dialog.Title
      ><Dialog.Description
        >{editingAccount?.archivedAt
          ? 'Currency and opening balance cannot be changed while this account is archived.'
          : 'Balances use the currency’s standard decimal precision.'}</Dialog.Description
      ></Dialog.Header
    >
    <form class="space-y-4" {onsubmit}>
      {#if error}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save account</Alert.Title><Alert.Description
            >{error}</Alert.Description
          ></Alert.Root
        >{/if}
      <div class="space-y-2">
        <Label for="account-name">Name</Label><Input
          id="account-name"
          required
          maxlength={120}
          bind:value={form.name}
        />
      </div>
      <div class="space-y-2">
        <Label for="account-type">Type</Label><select
          id="account-type"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={form.type}
          ><option value="current">Current</option><option value="savings"
            >Savings</option
          ><option value="cash">Cash</option></select
        >
      </div>
      <div class="space-y-2">
        <Label for="currency">Currency</Label><Select.Root
          type="single"
          bind:value={form.currency}
          disabled={!!editingAccount?.archivedAt}
        >
          <Select.Trigger id="currency" class="w-full"
            ><span>{form.currency}</span></Select.Trigger
          ><Select.Content
            >{#each currencies as currency}<Select.Item value={currency.code}
                >{currency.code} — {currency.name}</Select.Item
              >{/each}</Select.Content
          >
        </Select.Root>
      </div>
      <div class="space-y-2">
        <Label for="opening">Opening balance</Label><Input
          id="opening"
          required
          inputmode="decimal"
          disabled={!!editingAccount?.archivedAt}
          bind:value={form.amount}
        />
      </div>
      <Dialog.Footer
        ><Button type="submit" disabled={pending}>Save account</Button
        ></Dialog.Footer
      >
    </form></Dialog.Content
  >
</Dialog.Root>
