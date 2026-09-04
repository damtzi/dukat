<script lang="ts">
  import type { Account, Transaction } from '@dukat/core/ledger'
  import type { Category } from '@dukat/core/csv-import'
  import {
    Alert,
    Button,
    Dialog,
    Field,
    Input,
    Select,
    Textarea,
  } from '@dukat/ui'
  import { todayInWarsaw } from '$lib/date'

  let {
    open = $bindable(),
    form = $bindable(),
    editingTransaction,
    error,
    pending,
    onsubmit,
    categories,
    accounts,
    recentMerchants,
    recentCategoryIds,
  }: {
    open: boolean
    form: {
      accountId: string
      kind: Transaction['kind']
      amount: string
      date: string
      merchant: string
      description: string
      categoryId: string
    }
    editingTransaction: Transaction | null
    error: string
    pending: boolean
    onsubmit: (event: SubmitEvent) => void
    categories: Category[]
    accounts: Account[]
    recentMerchants: string[]
    recentCategoryIds: string[]
  } = $props()
  const transactionKinds = [
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
  ] as const
  let availableCategories = $derived(
    categories.filter(
      (category) =>
        !category.archivedAt ||
        (editingTransaction && category.id === form.categoryId),
    ),
  )
  let selectedCategory = $derived(
    availableCategories.find((category) => category.id === form.categoryId),
  )
  let recentCategories = $derived(
    recentCategoryIds
      .map((id) => availableCategories.find((category) => category.id === id))
      .filter((category): category is Category => Boolean(category)),
  )
  let otherCategories = $derived(
    availableCategories.filter(
      (category) => !recentCategoryIds.includes(category.id),
    ),
  )
  let activeAccounts = $derived(
    accounts.filter(({ archivedAt }) => !archivedAt),
  )
  let selectedAccount = $derived(
    activeAccounts.find(({ id }) => id === form.accountId),
  )
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    ><Dialog.Header
      ><Dialog.Title
        >{editingTransaction
          ? 'Edit transaction'
          : 'Add transaction'}</Dialog.Title
      ><Dialog.Description
        >Record completed income or spending.</Dialog.Description
      ></Dialog.Header
    >
    <form {onsubmit}>
      <Field.Group>
        {#if error}<Alert.Root variant="destructive"
            ><Alert.Title>Could not save transaction</Alert.Title
            ><Alert.Description>{error}</Alert.Description></Alert.Root
          >{/if}
        {#if !editingTransaction}
          <Field.Field>
            <Field.Label for="transaction-account">Account</Field.Label
            ><Select.Root type="single" bind:value={form.accountId}>
              <Select.Trigger id="transaction-account" class="w-full">
                {selectedAccount
                  ? `${selectedAccount.name} · ${selectedAccount.currency}`
                  : 'Select account'}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#each activeAccounts as account (account.id)}
                    <Select.Item value={account.id} label={account.name}
                      >{account.name} · {account.currency}</Select.Item
                    >
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </Field.Field>
        {/if}
        <Field.Field>
          <Field.Label for="kind">Kind</Field.Label><Select.Root
            type="single"
            bind:value={form.kind}
          >
            <Select.Trigger id="kind" class="w-full">
              {transactionKinds.find(({ value }) => value === form.kind)
                ?.label ?? 'Select kind'}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each transactionKinds as option (option.value)}
                  <Select.Item value={option.value} label={option.label}
                    >{option.label}</Select.Item
                  >
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Field.Field>
        <Field.Field>
          <Field.Label for="amount">Amount</Field.Label><Input
            id="amount"
            required
            inputmode="decimal"
            bind:value={form.amount}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="date">Date</Field.Label><Input
            id="date"
            required
            type="date"
            max={todayInWarsaw()}
            bind:value={form.date}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="transaction-category">Category</Field.Label
          ><Select.Root type="single" bind:value={form.categoryId}>
            <Select.Trigger id="transaction-category" class="w-full">
              {selectedCategory
                ? `${selectedCategory.name}${selectedCategory.archivedAt ? ' (archived, retained)' : ''}`
                : 'Uncategorized'}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                <Select.Item value="" label="Uncategorized"
                  >Uncategorized</Select.Item
                >
              </Select.Group>
              {#if recentCategories.length}
                <Select.Group>
                  <Select.GroupHeading>Recent</Select.GroupHeading>
                  {#each recentCategories as category (category.id)}
                    <Select.Item value={category.id} label={category.name}
                      >{category.name}</Select.Item
                    >
                  {/each}
                </Select.Group>
              {/if}
              <Select.Group>
                {#if recentCategories.length}
                  <Select.GroupHeading>All categories</Select.GroupHeading>
                {/if}
                {#each otherCategories as category (category.id)}
                  <Select.Item
                    value={category.id}
                    label={`${category.name}${category.archivedAt ? ' (archived, retained)' : ''}`}
                  >
                    {category.name}{category.archivedAt
                      ? ' (archived, retained)'
                      : ''}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Field.Field>
        <Field.Field>
          <Field.Label for="merchant">Merchant</Field.Label><Input
            id="merchant"
            list="recent-merchants"
            maxlength={200}
            autocomplete="organization"
            bind:value={form.merchant}
          />
          {#if recentMerchants.length}
            <Field.Description
              >Recent merchants are suggested.</Field.Description
            >
          {/if}
          <datalist id="recent-merchants">
            {#each recentMerchants as merchant (merchant)}
              <option value={merchant}></option>
            {/each}
          </datalist>
        </Field.Field>
        <Field.Field>
          <Field.Label for="description">Description</Field.Label><Textarea
            id="description"
            maxlength={500}
            bind:value={form.description}
          />
        </Field.Field>
        <Dialog.Footer
          ><Button type="submit" disabled={pending}>Save transaction</Button
          ></Dialog.Footer
        >
      </Field.Group>
    </form></Dialog.Content
  >
</Dialog.Root>
