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

<Card.Root>
  <Card.Header>
    <Card.Title id="monthly-cash-flow-title"
      >Monthly income and spending</Card.Title
    >
    <Card.Description>
      Grouped monthly values in {reporting.currency}. Net cash flow for
      {periodLabel} is {formatMoney(reporting.netMinor!, reporting.currency)}.
    </Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-4">
    <div
      class="flex h-56 items-end gap-3 overflow-x-auto border-b px-2 pt-4"
      role="group"
      aria-labelledby="monthly-cash-flow-title"
    >
      {#each reporting.months as month (month.month)}
        <div class="flex min-w-16 flex-1 flex-col items-center gap-2">
          <div class="flex h-44 items-end gap-1">
            <button
              class="min-h-1 w-5 bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style:height={`${Number((BigInt(month.incomeMinor) * 100n) / maximum)}%`}
              aria-label={`${month.month} income ${formatMoney(month.incomeMinor, reporting.currency)}`}
              title={`Income ${formatMoney(month.incomeMinor, reporting.currency)}`}
            ></button>
            <button
              class="min-h-1 w-5 bg-secondary-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style:height={`${Number((BigInt(month.spendingMinor) * 100n) / maximum)}%`}
              aria-label={`${month.month} spending ${formatMoney(month.spendingMinor, reporting.currency)}`}
              title={`Spending ${formatMoney(month.spendingMinor, reporting.currency)}`}
            ></button>
          </div>
          <span class="text-xs text-muted-foreground">{month.month}</span>
        </div>
      {/each}
    </div>
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
              >{formatMoney(month.incomeMinor, reporting.currency)}</Table.Cell
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
  </Card.Content>
</Card.Root>
