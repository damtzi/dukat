<script lang="ts">
  import type { Account, Transfer } from '@dukat/core/ledger'
  import { Alert, Button, Dialog, Input, Label, Textarea } from '@dukat/ui'
  import { todayInWarsaw } from '$lib/date'
  import { formatMoney, minorToDecimal, parseAmount } from '$lib/money'

  type Quote = {
    available: boolean
    suggestedAmountMinor: string | null
    rates: Array<{
      currency: string
      rateToPln: string
      source: string
      effectiveDate: string
      tableNumber: string | null
    }>
  }

  let {
    open = $bindable(),
    form = $bindable(),
    editingTransfer,
    error,
    pending,
    accounts,
    transferDestinations,
    quote,
    onsubmit,
  }: {
    open: boolean
    form: {
      fromAccountId: string
      toAccountId: string
      amount: string
      receivedAmount: string
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
    quote: (input: {
      fromCurrency: string
      toCurrency: string
      date: string
      amountMinor: string
    }) => Promise<Quote>
    onsubmit: (event: SubmitEvent) => void
  } = $props()
  let quoteText = $state('')
  let suggestedAmount = $state('')
  let suggestionApplied = false
  let quoteInputKey = ''
  let quoteGeneration = 0

  $effect(() => {
    const source = accounts.find((account) => account.id === form.fromAccountId)
    const destination = accounts.find(
      (account) => account.id === form.toAccountId,
    )
    const amount = form.amount
    const date = form.date
    const nextQuoteInputKey = `${source?.id ?? ''}:${destination?.id ?? ''}:${amount}:${date}`
    const generation = ++quoteGeneration
    if (suggestionApplied && quoteInputKey !== nextQuoteInputKey) {
      form.receivedAmount = ''
      suggestionApplied = false
    }
    quoteInputKey = nextQuoteInputKey
    suggestedAmount = ''
    if (
      !open ||
      !source ||
      !destination ||
      source.currency === destination.currency ||
      editingTransfer
    ) {
      quoteText = ''
      return
    }
    try {
      const amountMinor = parseAmount(amount, source.currency)
      void quote({
        fromCurrency: source.currency,
        toCurrency: destination.currency,
        date,
        amountMinor,
      })
        .then((result) => {
          if (generation !== quoteGeneration) return
          if (!result.available || !result.suggestedAmountMinor) {
            suggestedAmount = ''
            quoteText =
              'No date-appropriate exchange-rate suggestion is available.'
            return
          }
          const suggestion = minorToDecimal(
            result.suggestedAmountMinor,
            destination.currency,
          )
          suggestedAmount = suggestion
          quoteText = `Suggested ${formatMoney(result.suggestedAmountMinor, destination.currency)}. ${result.rates
            .map(
              (rate) =>
                `${rate.currency} ${rate.rateToPln} PLN · ${rate.source}${rate.tableNumber ? ` ${rate.tableNumber}` : ''} · ${rate.effectiveDate}`,
            )
            .join('; ')}. Confirm or edit the received amount.`
        })
        .catch(() => {
          if (generation === quoteGeneration) {
            suggestedAmount = ''
            quoteText = 'Exchange-rate suggestion is temporarily unavailable.'
          }
        })
    } catch {
      suggestedAmount = ''
      quoteText = ''
    }
  })
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
    <form class="flex flex-col gap-4" {onsubmit}>
      {#if error}<Alert.Root variant="destructive"
          ><Alert.Title>Could not save transfer</Alert.Title><Alert.Description
            >{error}</Alert.Description
          ></Alert.Root
        >{/if}
      <div class="flex flex-col gap-2">
        <Label for="transfer-source">Source account</Label><select
          id="transfer-source"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={form.fromAccountId}
          disabled={!!editingTransfer}
          onchange={() =>
            (form.toAccountId =
              transferDestinations(form.fromAccountId)[0]?.id ?? '')}
          >{#each accounts.filter((item) => !item.archivedAt) as item (item.id)}<option
              value={item.id}
              >{item.name} ({item.currency}){#if 'workspaceLabel' in item}
                — {item.workspaceLabel}{/if}</option
            >{/each}</select
        >
      </div>
      {#if accounts.find((item) => item.id === form.fromAccountId)?.currency !== accounts.find((item) => item.id === form.toAccountId)?.currency}<div
          class="flex flex-col gap-2"
        >
          <Label for="transfer-received">Exact amount received</Label><Input
            id="transfer-received"
            inputmode="decimal"
            required
            bind:value={form.receivedAmount}
            oninput={() => (suggestionApplied = false)}
          />
          <p class="text-xs text-muted-foreground">
            {quoteText ||
              'Enter the confirmed destination amount. A suggestion never replaces your confirmation.'}
          </p>
          {#if suggestedAmount}<Button
              type="button"
              size="sm"
              variant="outline"
              onclick={() => {
                form.receivedAmount = suggestedAmount
                suggestionApplied = true
              }}>Use suggestion</Button
            >{/if}
        </div>{/if}
      <div class="flex flex-col gap-2">
        <Label for="transfer-destination">Destination account</Label><select
          id="transfer-destination"
          class="block h-9 w-full rounded-md border bg-transparent px-3"
          bind:value={form.toAccountId}
          required
          >{#each transferDestinations(form.fromAccountId) as item (item.id)}<option
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
      <div class="flex flex-col gap-2">
        <Label for="transfer-amount">Transfer amount</Label><Input
          id="transfer-amount"
          inputmode="decimal"
          required
          bind:value={form.amount}
        />
      </div>
      <div class="flex flex-col gap-2">
        <Label for="transfer-date">Date</Label><Input
          id="transfer-date"
          type="date"
          max={todayInWarsaw()}
          required
          bind:value={form.date}
        />
      </div>
      <div class="flex flex-col gap-2">
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
          <div class="flex flex-col gap-2">
            <Label for="transfer-fee">Fee amount</Label><Input
              id="transfer-fee"
              inputmode="decimal"
              bind:value={form.fee}
            />
          </div>
          <div class="mt-3 flex flex-col gap-2">
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
