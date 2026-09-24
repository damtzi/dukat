<script lang="ts">
  import type { CashFlow } from '@dukat/core/csv-import'
  import { Card, Table } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let {
    reporting,
    periodLabel,
  }: {
    reporting: CashFlow['reporting']
    periodLabel: string
  } = $props()

  let maximum = $derived.by(() => {
    const values = reporting.months.flatMap((month) => [
      BigInt(month.incomeMinor),
      BigInt(month.spendingMinor),
    ])
    return values.reduce(
      (largest, value) => (value > largest ? value : largest),
      1n,
    )
  })
</script>

<Card.Root class="min-w-0">
  <Card.Header>
    <Card.Title id="monthly-cash-flow-title"
      >Monthly income and spending</Card.Title
    >
    <Card.Description>
      Net for {periodLabel}: {formatMoney(
        reporting.netMinor!,
        reporting.currency,
      )}.
    </Card.Description>
  </Card.Header>
  <Card.Content class="flex min-w-0 flex-col gap-3">
    <div
      class="flex gap-4 text-xs text-muted-foreground"
      aria-label="Chart legend"
    >
      <span class="flex items-center gap-2">
        <span class="size-2.5 bg-primary" aria-hidden="true"></span>
        Income
      </span>
      <span class="flex items-center gap-2">
        <span class="size-2.5 bg-secondary-foreground/50" aria-hidden="true"
        ></span>
        Spending
      </span>
    </div>
    <div
      class="flex h-36 items-end gap-1 overflow-x-auto border-b px-2 pt-2"
      role="group"
      aria-labelledby="monthly-cash-flow-title"
    >
      {#each reporting.months as month (month.month)}
        <div class="flex min-w-6 flex-1 flex-col items-center gap-2">
          <div class="flex h-24 items-end gap-1">
            <button
              class="min-h-1 w-3 bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-5"
              style:height={`${Number((BigInt(month.incomeMinor) * 100n) / maximum)}%`}
              aria-label={`${month.month} income ${formatMoney(month.incomeMinor, reporting.currency)}`}
              title={`Income ${formatMoney(month.incomeMinor, reporting.currency)}`}
            ></button>
            <button
              class="min-h-1 w-3 bg-secondary-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-5"
              style:height={`${Number((BigInt(month.spendingMinor) * 100n) / maximum)}%`}
              aria-label={`${month.month} spending ${formatMoney(month.spendingMinor, reporting.currency)}`}
              title={`Spending ${formatMoney(month.spendingMinor, reporting.currency)}`}
            ></button>
          </div>
          <span class="text-xs text-muted-foreground" title={month.month}
            >{month.month.slice(5)}</span
          >
        </div>
      {/each}
    </div>
    <details class="border-t pt-3">
      <summary class="cursor-pointer text-sm font-medium"
        >View monthly details</summary
      >
      <div class="mt-3 overflow-x-auto">
        <Table.Root tabindex={0} aria-label="Monthly cash-flow values">
          <Table.Caption>All monthly cash-flow values</Table.Caption>
          <Table.Header>
            <Table.Row>
              <Table.Head>Month</Table.Head>
              <Table.Head>Income</Table.Head>
              <Table.Head>Spending</Table.Head>
              <Table.Head>Net</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each reporting.months as month (month.month)}
              <Table.Row>
                <Table.Cell>{month.month}</Table.Cell>
                <Table.Cell
                  >{formatMoney(
                    month.incomeMinor,
                    reporting.currency,
                  )}</Table.Cell
                >
                <Table.Cell
                  >{formatMoney(
                    month.spendingMinor,
                    reporting.currency,
                  )}</Table.Cell
                >
                <Table.Cell
                  >{formatMoney(month.netMinor, reporting.currency)}</Table.Cell
                >
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </details>
  </Card.Content>
</Card.Root>
