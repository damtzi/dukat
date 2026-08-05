<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { Transaction } from '@dukat/core/ledger'
  import type { Category } from '@dukat/core/csv-import'
  import { Alert, Button, Dialog, Input, Label, Textarea } from '@dukat/ui'
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
    <form class="space-y-4" {onsubmit}>
      {#if error}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save transaction</Alert.Title
          ><Alert.Description>{error}</Alert.Description></Alert.Root
        >{/if}
      <div class="space-y-2">
        <Label for="kind">Kind</Label><select
          id="kind"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={form.kind}
          ><option value="expense">Expense</option><option value="income"
            >Income</option
          ></select
        >
      </div>
      <div class="space-y-2">
        <Label for="amount">Amount</Label><Input
          id="amount"
          required
          inputmode="decimal"
          bind:value={form.amount}
        />
      </div>
      <div class="space-y-2">
        <Label for="date">Date</Label><Input
          id="date"
          required
          type="date"
          max={todayInWarsaw()}
          bind:value={form.date}
        />
      </div>
      <div class="space-y-2">
        <Label for="transaction-category">Category</Label><select
          id="transaction-category"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={form.categoryId}
        >
          <option value="">Uncategorized</option>
          {#each categories.filter((category) => !category.archivedAt || (editingTransaction && category.id === form.categoryId)) as category}
            <option value={category.id}
              >{category.name}{category.archivedAt
                ? ' (archived, retained)'
                : ''}</option
            >
          {/each}
        </select>
      </div>
      <div class="space-y-2">
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
