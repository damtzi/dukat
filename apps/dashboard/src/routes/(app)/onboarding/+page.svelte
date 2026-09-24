<script lang="ts">
  import { untrack } from 'svelte'
  import { goto, invalidateAll } from '$app/navigation'
  import { resolve } from '$app/paths'
  import type { Account } from '@dukat/core/ledger'
  import { Alert, Button, Card, Field, Input, Select, Spinner } from '@dukat/ui'
  import CheckIcon from 'phosphor-svelte/lib/Check'
  import { api } from '$lib/api'
  import { currencies } from '$lib/controllers/ledger-workflows/accounts.svelte'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'
  import { todayInWarsaw } from '$lib/date'
  import { parseAmount } from '$lib/money'
  import type { PageProps } from './$types'

  const accountTypes: readonly { value: Account['type']; label: string }[] = [
    { value: 'current', label: 'Current account' },
    { value: 'savings', label: 'Savings account' },
    { value: 'cash', label: 'Cash' },
  ]

  let { data }: PageProps = $props()
  const personalWorkspace = untrack(
    () => data.workspaces.find(({ type }) => type === 'personal') as Workspace,
  )
  let step = $state<1 | 2>(
    untrack(() => (data.personalAccounts.length ? 2 : 1)),
  )
  let reportingCurrency = $state(personalWorkspace.reportingCurrency ?? 'PLN')
  let accountName = $state('')
  let accountType = $state<Account['type']>('current')
  let openingBalance = $state('0')
  let pending = $state(false)
  let message = $state('')
  const openingDate = todayInWarsaw()
  const idempotencyKey = crypto.randomUUID()
  let currencyLabel = $derived(
    currencies.find(({ code }) => code === reportingCurrency)?.name ?? '',
  )
  let accountTypeLabel = $derived(
    accountTypes.find(({ value }) => value === accountType)?.label ?? '',
  )

  function continueToAccount(event: SubmitEvent) {
    event.preventDefault()
    message = ''
    step = 2
  }

  async function finish(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    pending = true
    message = ''
    try {
      if (!data.personalAccounts.length) {
        await api(`/workspaces/${personalWorkspace.id}/accounts`, {
          method: 'POST',
          body: JSON.stringify({
            name: accountName.trim(),
            type: accountType,
            currency: reportingCurrency,
            openingDate,
            openingBalanceMinor: parseAmount(
              openingBalance,
              reportingCurrency,
              true,
            ),
            creditLimitMinor: null,
            statementDate: null,
            paymentDueDate: null,
            idempotencyKey,
          }),
        })
      }
      await api(`/workspaces/${personalWorkspace.id}/onboarding`, {
        method: 'POST',
        body: JSON.stringify({
          reportingCurrency,
          version: personalWorkspace.version,
        }),
      })
      await invalidateAll()
      await goto(resolve('/home'), { replaceState: true })
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Set up Dukat</title></svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10">
  <div class="flex w-full flex-col gap-6">
    <header class="text-center">
      <p class="mb-3 text-sm font-medium text-muted-foreground">
        Step {step} of 2
      </p>
      <h1 class="font-heading text-3xl font-semibold tracking-tight">
        {step === 1
          ? 'Choose your reporting currency'
          : 'Add your first account'}
      </h1>
      <p class="mt-2 text-muted-foreground">
        {step === 1
          ? 'Dukat uses this currency to combine balances in Home.'
          : 'Start with the account you use most. You can add others later.'}
      </p>
    </header>

    <ol class="grid grid-cols-2 gap-2" aria-label="Setup progress">
      <li class="flex items-center gap-2 border px-3 py-2 text-sm">
        {#if step === 2}<CheckIcon aria-hidden="true" />{:else}<span
            aria-hidden="true">1</span
          >{/if}
        Reporting currency
      </li>
      <li
        class="flex items-center gap-2 border px-3 py-2 text-sm"
        class:text-muted-foreground={step === 1}
      >
        <span aria-hidden="true">2</span> First account
      </li>
    </ol>

    <Card.Root>
      <Card.Content class="pt-6">
        {#if message}
          <Alert.Root variant="destructive" class="mb-5" role="alert">
            <Alert.Title>Could not finish setup</Alert.Title>
            <Alert.Description>{message}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if step === 1}
          <form onsubmit={continueToAccount}>
            <Field.Group>
              <Field.Field>
                <Field.Label for="reporting-currency">
                  Reporting currency
                </Field.Label>
                <Select.Root type="single" bind:value={reportingCurrency}>
                  <Select.Trigger id="reporting-currency" class="w-full">
                    {reportingCurrency} — {currencyLabel}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Group>
                      {#each currencies as currency (currency.code)}
                        <Select.Item
                          value={currency.code}
                          label={`${currency.code} — ${currency.name}`}
                        >
                          {currency.code} — {currency.name}
                        </Select.Item>
                      {/each}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
                <Field.Description>
                  Your accounts can still use other currencies.
                </Field.Description>
              </Field.Field>
              <Button type="submit" class="w-full">Continue</Button>
            </Field.Group>
          </form>
        {:else if data.personalAccounts.length}
          <form onsubmit={finish}>
            <Field.Group>
              <p class="text-sm text-muted-foreground">
                Your account was saved. Finish setup to continue to Home.
              </p>
              <Button type="submit" class="w-full" disabled={pending}>
                {#if pending}<Spinner
                    aria-hidden="true"
                    data-icon="inline-start"
                  />{/if}
                Finish setup
              </Button>
            </Field.Group>
          </form>
        {:else}
          <form onsubmit={finish}>
            <Field.Group>
              <Field.Field>
                <Field.Label for="account-name">Account name</Field.Label>
                <Input
                  id="account-name"
                  maxlength={120}
                  placeholder="Everyday account"
                  required
                  bind:value={accountName}
                />
              </Field.Field>
              <Field.Field>
                <Field.Label for="account-type">Account type</Field.Label>
                <Select.Root type="single" bind:value={accountType}>
                  <Select.Trigger id="account-type" class="w-full">
                    {accountTypeLabel}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Group>
                      {#each accountTypes as type (type.value)}
                        <Select.Item value={type.value} label={type.label}>
                          {type.label}
                        </Select.Item>
                      {/each}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
              </Field.Field>
              <Field.Field>
                <Field.Label for="opening-balance">Current balance</Field.Label>
                <Input
                  id="opening-balance"
                  inputmode="decimal"
                  required
                  bind:value={openingBalance}
                />
                <Field.Description>
                  In {reportingCurrency}. Use 0 if you want to update it later.
                </Field.Description>
              </Field.Field>
              <div
                class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"
              >
                <Button
                  type="button"
                  variant="ghost"
                  onclick={() => (step = 1)}
                >
                  Back
                </Button>
                <Button type="submit" disabled={pending}>
                  {#if pending}<Spinner
                      aria-hidden="true"
                      data-icon="inline-start"
                    />{/if}
                  Finish setup
                </Button>
              </div>
            </Field.Group>
          </form>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</main>
