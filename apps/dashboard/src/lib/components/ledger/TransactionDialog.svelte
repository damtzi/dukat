<script lang="ts">
  import type { Transaction } from '@dukat/core/ledger'
  import type { Category } from '@dukat/core/csv-import'
  import {
    Alert,
    Button,
    Dialog,
    Input,
    Label,
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
  }: {
    open: boolean
    form: {
      kind: Transaction['kind']
      amount: string
      date: string
      description: string
      categoryId: string
    }
    editingTransaction: Transaction | null
    error: string
    pending: boolean
    onsubmit: (event: SubmitEvent) => void
    categories: Category[]
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
    <form class="flex flex-col gap-4" {onsubmit}>
      {#if error}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save transaction</Alert.Title
          ><Alert.Description>{error}</Alert.Description></Alert.Root
        >{/if}
      <div class="flex flex-col gap-2">
        <Label for="kind">Kind</Label><Select.Root
          type="single"
          bind:value={form.kind}
        >
          <Select.Trigger id="kind" class="w-full">
            {transactionKinds.find(({ value }) => value === form.kind)?.label ??
              'Select kind'}
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
      </div>
      <div class="flex flex-col gap-2">
        <Label for="amount">Amount</Label><Input
          id="amount"
          required
          inputmode="decimal"
          bind:value={form.amount}
        />
      </div>
      <div class="flex flex-col gap-2">
        <Label for="date">Date</Label><Input
          id="date"
          required
          type="date"
          max={todayInWarsaw()}
          bind:value={form.date}
        />
      </div>
      <div class="flex flex-col gap-2">
        <Label for="transaction-category">Category</Label><Select.Root
          type="single"
          bind:value={form.categoryId}
        >
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
              {#each availableCategories as category (category.id)}
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
      </div>
      <div class="flex flex-col gap-2">
        <Label for="description">Description</Label><Textarea
          id="description"
          maxlength={500}
          bind:value={form.description}
        />
      </div>
      <Dialog.Footer
        ><Button type="submit" disabled={pending}>Save transaction</Button
        ></Dialog.Footer
      >
    </form></Dialog.Content
  >
</Dialog.Root>
