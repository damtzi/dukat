<script lang="ts">
  import type { Account } from '@dukat/core/ledger'
  import { Alert, Button, Dialog, Field, Input, Select } from '@dukat/ui'

  const accountTypes: readonly {
    value: Account['type']
    label: string
  }[] = [
    { value: 'current', label: 'Current' },
    { value: 'savings', label: 'Savings' },
    { value: 'cash', label: 'Cash' },
  ]

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

  let accountTypeLabel = $derived(
    accountTypes.find(({ value }) => value === form.type)?.label ??
      'Select a type',
  )
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
    <form {onsubmit}>
      <Field.Group>
        {#if error}<Alert.Root variant="destructive"
            ><Alert.Title>Could not save account</Alert.Title><Alert.Description
              >{error}</Alert.Description
            ></Alert.Root
          >{/if}
        <Field.Field>
          <Field.Label for="account-name">Name</Field.Label><Input
            id="account-name"
            required
            maxlength={120}
            bind:value={form.name}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="account-type">Type</Field.Label><Select.Root
            type="single"
            bind:value={form.type}
          >
            <Select.Trigger id="account-type" class="w-full">
              {accountTypeLabel}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each accountTypes as accountType (accountType.value)}
                  <Select.Item
                    value={accountType.value}
                    label={accountType.label}
                  >
                    {accountType.label}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Field.Field>
        <Field.Field data-disabled={!!editingAccount?.archivedAt}>
          <Field.Label for="currency">Currency</Field.Label><Select.Root
            type="single"
            bind:value={form.currency}
            disabled={!!editingAccount?.archivedAt}
          >
            <Select.Trigger id="currency" class="w-full"
              ><span>{form.currency}</span></Select.Trigger
            ><Select.Content
              ><Select.Group
                >{#each currencies as currency (currency.code)}<Select.Item
                    value={currency.code}
                    label={`${currency.code} — ${currency.name}`}
                    >{currency.code} — {currency.name}</Select.Item
                  >{/each}</Select.Group
              ></Select.Content
            >
          </Select.Root>
        </Field.Field>
        <Field.Field data-disabled={!!editingAccount?.archivedAt}>
          <Field.Label for="opening">Opening balance</Field.Label><Input
            id="opening"
            required
            inputmode="decimal"
            disabled={!!editingAccount?.archivedAt}
            bind:value={form.amount}
          />
        </Field.Field>
        <Dialog.Footer
          ><Button type="submit" disabled={pending}>Save account</Button
          ></Dialog.Footer
        >
      </Field.Group>
    </form></Dialog.Content
  >
</Dialog.Root>
