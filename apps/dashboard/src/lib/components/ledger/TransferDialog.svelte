<script lang="ts">
  import type { Account, Transfer } from '@dukat/core/ledger'
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
  const accountLabel = (account: Account) =>
    `${account.name} (${account.currency})${'workspaceLabel' in account ? ` — ${String(account.workspaceLabel)}` : ''}`
  let activeSourceAccounts = $derived(
    accounts.filter((account) => !account.archivedAt),
  )
  let destinationAccounts = $derived(transferDestinations(form.fromAccountId))
  let sourceAccount = $derived(
    accounts.find((account) => account.id === form.fromAccountId),
  )
  let destinationAccount = $derived(
    destinationAccounts.find((account) => account.id === form.toAccountId),
  )

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
  <Dialog.Content class="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
    ><Dialog.Header
      ><Dialog.Title
        >{editingTransfer ? 'Edit transfer' : 'New transfer'}</Dialog.Title
      ><Dialog.Description
        >Transfers are not income or spending. An optional fee is saved as a
        separate expense on the source account.</Dialog.Description
      ></Dialog.Header
    >
    <form {onsubmit}>
      <Field.Group>
        {#if error}<Alert.Root variant="destructive"
            ><Alert.Title>Could not save transfer</Alert.Title
            ><Alert.Description>{error}</Alert.Description></Alert.Root
          >{/if}
        <Field.Field>
          <Field.Label for="transfer-source">Source account</Field.Label
          ><Select.Root
            type="single"
            bind:value={form.fromAccountId}
            disabled={!!editingTransfer}
            onValueChange={(sourceId) =>
              (form.toAccountId = transferDestinations(sourceId)[0]?.id ?? '')}
          >
            <Select.Trigger id="transfer-source" class="w-full">
              {sourceAccount
                ? accountLabel(sourceAccount)
                : 'Select source account'}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each activeSourceAccounts as item (item.id)}
                  <Select.Item value={item.id} label={accountLabel(item)}>
                    {accountLabel(item)}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Field.Field>
        {#if accounts.find((item) => item.id === form.fromAccountId)?.currency !== accounts.find((item) => item.id === form.toAccountId)?.currency}<Field.Field
          >
            <Field.Label for="transfer-received"
              >Exact amount received</Field.Label
            ><Input
              id="transfer-received"
              inputmode="decimal"
              required
              bind:value={form.receivedAmount}
              oninput={() => (suggestionApplied = false)}
            />
            <Field.Description>
              {quoteText ||
                'Enter the confirmed destination amount. A suggestion never replaces your confirmation.'}
            </Field.Description>
            {#if suggestedAmount}<Button
                type="button"
                size="sm"
                variant="outline"
                onclick={() => {
                  form.receivedAmount = suggestedAmount
                  suggestionApplied = true
                }}>Use suggestion</Button
              >{/if}
          </Field.Field>{/if}
        <Field.Field>
          <Field.Label for="transfer-destination"
            >Destination account</Field.Label
          >
          <Select.Root type="single" bind:value={form.toAccountId} required>
            <Select.Trigger id="transfer-destination" class="w-full">
              {destinationAccount
                ? accountLabel(destinationAccount)
                : 'Select destination account'}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each destinationAccounts as item (item.id)}
                  <Select.Item value={item.id} label={accountLabel(item)}>
                    {accountLabel(item)}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
          {#if destinationAccounts.length === 0}<Field.Error>
              No active destination is available.
            </Field.Error>{/if}
        </Field.Field>
        <Field.Field>
          <Field.Label for="transfer-amount">Transfer amount</Field.Label><Input
            id="transfer-amount"
            inputmode="decimal"
            required
            bind:value={form.amount}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="transfer-date">Date</Field.Label><Input
            id="transfer-date"
            type="date"
            max={todayInWarsaw()}
            required
            bind:value={form.date}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="transfer-note">Note</Field.Label><Textarea
            id="transfer-note"
            maxlength={500}
            bind:value={form.description}
          />
        </Field.Field>
        {#if !editingTransfer}<Field.Set class="inset-panel">
            <Field.Legend>Optional fee</Field.Legend>
            <Field.Description>
              Optional fee — this creates a separate ordinary spending
              transaction and is not folded into the transfer amount.
            </Field.Description>
            <Field.Group>
              <Field.Field>
                <Field.Label for="transfer-fee">Fee amount</Field.Label><Input
                  id="transfer-fee"
                  inputmode="decimal"
                  bind:value={form.fee}
                />
              </Field.Field>
              <Field.Field>
                <Field.Label for="fee-description">Fee description</Field.Label
                ><Input
                  id="fee-description"
                  maxlength={500}
                  placeholder="Transfer fee"
                  bind:value={form.feeDescription}
                />
              </Field.Field>
            </Field.Group>
          </Field.Set>{/if}
        <Dialog.Footer
          ><Button type="submit" disabled={pending || !form.toAccountId}
            >Save transfer</Button
          ></Dialog.Footer
        >
      </Field.Group>
    </form>
  </Dialog.Content>
</Dialog.Root>
