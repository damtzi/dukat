<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { Alert, Button, Card, Field, Input } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import { workspacesDataDependency, workspaceDataDependency } from '$lib/api'
  import { api } from '$lib/controllers/workspace-controller.svelte'
  import { todayInWarsaw } from '$lib/date'
  import { formatMoney, parseAmount } from '$lib/money'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
  const { workspace } = getWorkspaceDashboardContext()
  let principal = $state('')
  let balance = $state('')
  let startDate = $state('')
  let termYears = $state('')
  let rate = $state('')
  let interestType = $state<'fixed' | 'variable'>('fixed')
  let accountId = $state('')
  let error = $state('')
  let pending = $state(false)
  let showSchedule = $state(false)
  let accounts = $derived(
    workspace.accounts.filter(
      (account) => !account.archivedAt && account.type !== 'credit_card',
    ),
  )
  let currency = $derived(
    accounts.find((account) => account.id === accountId)?.currency ?? '',
  )
  let loan = $derived(data.mortgage)
  let nextPayment = $derived(
    loan?.schedule.find((payment) => payment.date >= todayInWarsaw()),
  )
  let paid = $derived(
    loan
      ? BigInt(loan.originalPrincipalMinor) - BigInt(loan.currentBalanceMinor)
      : 0n,
  )
  let progress = $derived(
    loan
      ? Number(
          (paid * 100n + BigInt(loan.originalPrincipalMinor) / 2n) /
            BigInt(loan.originalPrincipalMinor),
        )
      : 0,
  )

  async function create(event: SubmitEvent) {
    event.preventDefault()
    error = ''
    pending = true
    try {
      const normalizedRate = rate.replace(',', '.')
      if (!/^\d+(\.\d{1,2})?$/.test(normalizedRate))
        throw new Error('Enter an annual rate with at most two decimal places.')
      const [wholeRate, fractionRate = ''] = normalizedRate.split('.')
      await api(`/workspaces/${workspace.workspaceId}/mortgage`, {
        method: 'POST',
        body: JSON.stringify({
          originalPrincipalMinor: parseAmount(principal, currency),
          currentBalanceMinor: parseAmount(balance, currency),
          startDate,
          termMonths: Number(termYears) * 12,
          interestType,
          annualRateBasisPoints:
            Number(wholeRate) * 100 + Number(fractionRate.padEnd(2, '0')),
          paymentAccountId: accountId,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      await Promise.all([
        invalidate(workspacesDataDependency),
        invalidate(workspaceDataDependency),
      ])
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Mortgage · Dukat</title></svelte:head>
<section class="flex flex-col gap-6" aria-labelledby="mortgage-title">
  <PageHeader
    id="mortgage-title"
    title="Mortgage"
    description="Your loan, at a glance."
  />
  {#if error}
    <Alert.Root variant="destructive" role="alert"
      ><Alert.Title>Could not save</Alert.Title><Alert.Description
        >{error}</Alert.Description
      ></Alert.Root
    >
  {/if}
  {#if loan}
    <div class="grid gap-4 md:grid-cols-2">
      <Card.Root>
        <Card.Header
          ><Card.Description>Balance entered at setup</Card.Description
          ><Card.Title class="text-3xl"
            >{formatMoney(loan.currentBalanceMinor, loan.currency)}</Card.Title
          ></Card.Header
        >
        <Card.Content class="flex flex-col gap-3">
          <div class="flex justify-between text-sm">
            <span>Principal repaid</span><span>{progress}%</span>
          </div>
          <div
            class="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Principal repaid"
            aria-valuenow={progress}
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded-full bg-primary"
              style:width={`${progress}%`}
            ></div>
          </div>
          <p class="text-sm text-muted-foreground">
            {formatMoney(paid.toString(), loan.currency)} of {formatMoney(
              loan.originalPrincipalMinor,
              loan.currency,
            )} repaid
          </p>
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header
          ><Card.Description>Next projected payment</Card.Description
          ><Card.Title
            >{nextPayment
              ? formatMoney(nextPayment.paymentMinor, loan.currency)
              : 'No future payments'}</Card.Title
          ></Card.Header
        >
        <Card.Content class="flex flex-col gap-2 text-sm">
          {#if nextPayment}<p>
              {nextPayment.date} · {loan.paymentAccountName}
            </p>
            <p>
              Principal {formatMoney(nextPayment.principalMinor, loan.currency)} ·
              Interest {formatMoney(nextPayment.interestMinor, loan.currency)}
            </p>{/if}
          <p class="text-muted-foreground">
            Projected only · the app does not post installments yet
          </p>
        </Card.Content>
      </Card.Root>
    </div>
    <Card.Root>
      <Card.Header
        ><Card.Title>Terms</Card.Title><Card.Description
          >{loan.interestType === 'fixed' ? 'Fixed' : 'Variable'} rate · {(
            loan.annualRateBasisPoints / 100
          ).toFixed(2)}% annually · {loan.termMonths} months from {loan.startDate}</Card.Description
        ></Card.Header
      >
      <Card.Content
        ><Button
          variant="outline"
          onclick={() => (showSchedule = !showSchedule)}
          aria-expanded={showSchedule}
          >{showSchedule ? 'Hide' : 'View'} repayment schedule</Button
        ></Card.Content
      >
    </Card.Root>
    {#if showSchedule}
      <Card.Root>
        <Card.Header
          ><Card.Title>Projected repayment schedule</Card.Title
          ><Card.Description
            >Projected from the balance and rate at setup. Variable rates may
            change. The app does not post installments yet. <span
              class="sm:hidden">Swipe sideways to see all columns.</span
            ></Card.Description
          ></Card.Header
        >
        <Card.Content class="overflow-x-auto">
          <table class="w-full min-w-[500px] text-left text-sm">
            <thead
              ><tr class="border-b"
                ><th class="py-2">Due date</th><th class="py-2 text-right"
                  >Payment</th
                ><th class="py-2 text-right">Principal</th><th
                  class="py-2 text-right">Interest</th
                ><th class="py-2 text-right">Balance</th></tr
              ></thead
            >
            <tbody
              >{#each loan.schedule as payment (payment.number)}<tr
                  class="border-b"
                  ><td class="py-2">{payment.date}</td><td class="text-right"
                    >{formatMoney(payment.paymentMinor, loan.currency)}</td
                  ><td class="text-right"
                    >{formatMoney(payment.principalMinor, loan.currency)}</td
                  ><td class="text-right"
                    >{formatMoney(payment.interestMinor, loan.currency)}</td
                  ><td class="text-right"
                    >{formatMoney(
                      payment.closingBalanceMinor,
                      loan.currency,
                    )}</td
                  ></tr
                >{/each}</tbody
            >
          </table>
        </Card.Content>
      </Card.Root>
    {/if}
  {:else}
    <Card.Root class="max-w-2xl">
      <Card.Header
        ><Card.Title>Set up your mortgage</Card.Title><Card.Description
          >Add a loan to this workspace. Enter the outstanding balance at setup;
          any earlier payments are not reconstructed.</Card.Description
        ></Card.Header
      >
      <Card.Content>
        {#if accounts.length === 0}<p>
            Add a current, savings, or cash account before setting up a
            mortgage.
          </p>{:else}
          <form onsubmit={create} class="flex flex-col gap-6">
            <Field.Group>
              <Field.Field
                ><Field.Label for="payment-account">Payment account</Field.Label
                ><select
                  id="payment-account"
                  class="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  bind:value={accountId}
                  required
                  ><option value="" disabled>Select an account</option
                  >{#each accounts as account (account.id)}<option
                      value={account.id}
                      >{account.name} · {account.currency}</option
                    >{/each}</select
                ></Field.Field
              >
              {#if currency}
                <div class="grid gap-4 sm:grid-cols-2">
                  <Field.Field
                    ><Field.Label for="principal"
                      >Original principal ({currency})</Field.Label
                    ><Input
                      id="principal"
                      inputmode="decimal"
                      bind:value={principal}
                      required
                      placeholder="300000"
                    /></Field.Field
                  >
                  <Field.Field
                    ><Field.Label for="balance"
                      >Current balance ({currency})</Field.Label
                    ><Input
                      id="balance"
                      inputmode="decimal"
                      bind:value={balance}
                      required
                      placeholder="250000"
                    /></Field.Field
                  >
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  <Field.Field
                    ><Field.Label for="start-date">Loan start date</Field.Label
                    ><Input
                      id="start-date"
                      type="date"
                      bind:value={startDate}
                      required
                    /></Field.Field
                  >
                  <Field.Field
                    ><Field.Label for="term">Original term (years)</Field.Label
                    ><Input
                      id="term"
                      type="number"
                      min="1"
                      max="50"
                      step="1"
                      bind:value={termYears}
                      required
                    /></Field.Field
                  >
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  <Field.Field
                    ><Field.Label for="rate"
                      >Annual interest rate (%)</Field.Label
                    ><Input
                      id="rate"
                      inputmode="decimal"
                      bind:value={rate}
                      required
                      placeholder="5.25"
                    /></Field.Field
                  >
                  <Field.Field
                    ><Field.Label for="rate-type">Interest type</Field.Label
                    ><select
                      id="rate-type"
                      class="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      bind:value={interestType}
                      ><option value="fixed">Fixed</option><option
                        value="variable">Variable</option
                      ></select
                    ></Field.Field
                  >
                </div>
              {/if}
            </Field.Group>
            <Button type="submit" disabled={pending || !currency}
              >{pending ? 'Saving…' : 'Create mortgage'}</Button
            >
          </form>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</section>
