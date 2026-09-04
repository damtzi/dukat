<script lang="ts">
  import type {
    Account,
    HouseholdExpense,
    Transaction,
  } from '@dukat/core/ledger'
  import type { Category } from '@dukat/core/csv-import'
  import {
    Alert,
    Button,
    Checkbox,
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
    editingHouseholdExpense,
    creatingHouseholdExpense,
    refundingExpense,
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
      allocationMode: 'equal' | 'custom'
      allocations: Array<{
        memberUserId: string
        name: string
        selected: boolean
        amount: string
      }>
    }
    editingTransaction: Transaction | null
    editingHouseholdExpense: HouseholdExpense | null
    creatingHouseholdExpense: boolean
    refundingExpense: Transaction | null
    error: string
    pending: boolean
    onsubmit: (event: SubmitEvent) => void
    categories: Category[]
    accounts: Array<Account & { workspaceLabel?: string }>
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
  let refundMode = $derived(
    Boolean(refundingExpense || editingTransaction?.kind === 'refund'),
  )
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[calc(100svh-2rem)] overflow-y-auto"
    ><Dialog.Header
      ><Dialog.Title
        >{refundingExpense
          ? 'Add refund'
          : editingHouseholdExpense
            ? 'Edit Household expense'
            : creatingHouseholdExpense
              ? 'Add Household expense'
              : editingTransaction?.kind === 'refund'
                ? 'Edit refund'
                : editingTransaction
                  ? 'Edit transaction'
                  : 'Add transaction'}</Dialog.Title
      ><Dialog.Description
        >{refundMode
          ? 'Link returned money to the original expense. It reduces spending, not income.'
          : creatingHouseholdExpense
            ? 'Record Household spending paid from your Personal account. Other members cannot see the account.'
            : 'Record completed income or spending.'}</Dialog.Description
      ></Dialog.Header
    >
    <form {onsubmit}>
      <Field.Group>
        {#if error}<Alert.Root variant="destructive"
            ><Alert.Title>Could not save transaction</Alert.Title
            ><Alert.Description>{error}</Alert.Description></Alert.Root
          >{/if}
        {#if (!editingTransaction && !refundingExpense && !creatingHouseholdExpense) || (creatingHouseholdExpense && !editingHouseholdExpense)}
          <Field.Field>
            <Field.Label for="transaction-account"
              >{creatingHouseholdExpense
                ? 'Personal account'
                : 'Account'}</Field.Label
            >
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
                      >{account.name} · {account.currency}{account.workspaceLabel
                        ? ` · ${account.workspaceLabel}`
                        : ''}</Select.Item
                    >
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </Field.Field>
        {/if}
        {#if !refundMode && !creatingHouseholdExpense}
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
        {/if}
        <Field.Field>
          <Field.Label for="amount">Amount</Field.Label><Input
            id="amount"
            required
            inputmode="decimal"
            bind:value={form.amount}
          />
        </Field.Field>
        {#if creatingHouseholdExpense}
          <Field.FieldSet>
            <Field.Legend>Allocation</Field.Legend>
            <Field.Description>
              Equal split is the default. The exact minor-unit remainder goes to
              members in stable order.
            </Field.Description>
            <Field.Field>
              <Field.Label for="allocation-mode">Split</Field.Label>
              <Select.Root type="single" bind:value={form.allocationMode}>
                <Select.Trigger id="allocation-mode" class="w-full">
                  {form.allocationMode === 'equal'
                    ? 'Equal split'
                    : 'Custom amounts'}
                </Select.Trigger>
                <Select.Content>
                  <Select.Group>
                    <Select.Item value="equal" label="Equal split"
                      >Equal split</Select.Item
                    >
                    <Select.Item value="custom" label="Custom amounts"
                      >Custom amounts</Select.Item
                    >
                  </Select.Group>
                </Select.Content>
              </Select.Root>
            </Field.Field>
            <Field.Group>
              {#each form.allocations as allocation (allocation.memberUserId)}
                <Field.Field orientation="horizontal">
                  <Checkbox
                    id={`allocation-member-${allocation.memberUserId}`}
                    bind:checked={allocation.selected}
                  />
                  <Field.Label
                    for={`allocation-member-${allocation.memberUserId}`}
                    class="min-w-0 flex-1">{allocation.name}</Field.Label
                  >
                  {#if form.allocationMode === 'custom'}
                    <Input
                      aria-label={`${allocation.name} allocation`}
                      class="w-32"
                      inputmode="decimal"
                      required={allocation.selected}
                      disabled={!allocation.selected}
                      bind:value={allocation.amount}
                    />
                  {/if}
                </Field.Field>
              {/each}
            </Field.Group>
          </Field.FieldSet>
        {/if}
        <Field.Field>
          <Field.Label for="date">Date</Field.Label><Input
            id="date"
            required
            type="date"
            min={refundingExpense?.date}
            max={todayInWarsaw()}
            bind:value={form.date}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="transaction-category">Category</Field.Label>
          {#if refundMode}
            <Input
              id="transaction-category"
              value={selectedCategory?.name ?? 'Uncategorized'}
              disabled
            />
            <Field.Description
              >Refunds keep the original expense category.</Field.Description
            >
          {:else}<Select.Root type="single" bind:value={form.categoryId}>
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
            </Select.Root>{/if}
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
          ><Button type="submit" disabled={pending}
            >{refundMode
              ? 'Save refund'
              : creatingHouseholdExpense
                ? 'Save Household expense'
                : 'Save transaction'}</Button
          ></Dialog.Footer
        >
      </Field.Group>
    </form></Dialog.Content
  >
</Dialog.Root>
