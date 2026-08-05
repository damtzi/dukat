<script lang="ts">
  /* eslint-disable svelte/require-each-key */
  import type { Account, Transfer } from '@dukat/core/ledger'
  import { Alert, Button, Dialog, Input, Label, Textarea } from '@dukat/ui'
  import { todayInWarsaw } from '$lib/date'

  let {
    open = $bindable(),
    form = $bindable(),
    editingTransfer,
    error,
    pending,
    accounts,
    transferDestinations,
    onsubmit,
  }: {
    open: boolean
    form: {
      fromAccountId: string
      toAccountId: string
      amount: string
      date: string
      description: string
      fee: string
      feeDescription: string
    }
    editingTransfer: Transfer | null
    error: string
    pending: boolean
    accounts: Account[]
    transferDestinations: (sourceId: string) => Account[]
    onsubmit: (event: SubmitEvent) => void
  } = $props()
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    ><Dialog.Header
      ><Dialog.Title
        >{editingTransfer ? 'Edit transfer' : 'New transfer'}</Dialog.Title
      ><Dialog.Description
        >Transfers are not income or spending. An optional fee is saved as a
        separate expense on the source account.</Dialog.Description
      ></Dialog.Header
    >
    <form class="space-y-4" {onsubmit}>
      {#if error}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save transfer</Alert.Title><Alert.Description
            >{error}</Alert.Description
          ></Alert.Root
        >{/if}
      <div class="space-y-2">
        <Label for="transfer-source">Source account</Label><select
          id="transfer-source"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={form.fromAccountId}
          disabled={!!editingTransfer}
          onchange={() =>
            (form.toAccountId =
              transferDestinations(form.fromAccountId)[0]?.id ?? '')}
          >{#each accounts.filter((item) => !item.archivedAt) as item}<option
              value={item.id}
              >{item.name} ({item.currency}){#if 'workspaceLabel' in item}
                — {item.workspaceLabel}{/if}</option
            >{/each}</select
        >
      </div>
      <div class="space-y-2">
        <Label for="transfer-destination">Destination account</Label><select
          id="transfer-destination"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={form.toAccountId}
          required
          >{#each transferDestinations(form.fromAccountId) as item}<option
              value={item.id}
              >{item.name} ({item.currency}){#if 'workspaceLabel' in item}
                — {item.workspaceLabel}{/if}</option
            >{/each}</select
        >{#if transferDestinations(form.fromAccountId).length === 0}<p
            class="text-sm text-destructive"
          >
            No active destination is available.
          </p>{/if}
      </div>
      <div class="space-y-2">
        <Label for="transfer-amount">Transfer amount</Label><Input
          id="transfer-amount"
          inputmode="decimal"
          required
          bind:value={form.amount}
        />
      </div>
      <div class="space-y-2">
        <Label for="transfer-date">Date</Label><Input
          id="transfer-date"
          type="date"
          max={todayInWarsaw()}
          required
          bind:value={form.date}
        />
      </div>
      <div class="space-y-2">
        <Label for="transfer-note">Note</Label><Textarea
          id="transfer-note"
          maxlength={500}
          bind:value={form.description}
        />
      </div>
      {#if !editingTransfer}<div class="rounded-md border p-3">
          <p class="mb-3 text-sm">
            Optional fee — this creates a separate ordinary spending transaction
            and is not folded into the transfer amount.
          </p>
          <div class="space-y-2">
            <Label for="transfer-fee">Fee amount</Label><Input
              id="transfer-fee"
              inputmode="decimal"
              bind:value={form.fee}
            />
          </div>
          <div class="mt-3 space-y-2">
            <Label for="fee-description">Fee description</Label><Input
              id="fee-description"
              maxlength={500}
              placeholder="Transfer fee"
              bind:value={form.feeDescription}
            />
          </div>
        </div>{/if}
      <Dialog.Footer
        ><Button type="submit" disabled={pending || !form.toAccountId}
          >Save transfer</Button
        ></Dialog.Footer
      >
    </form>
  </Dialog.Content>
</Dialog.Root>
