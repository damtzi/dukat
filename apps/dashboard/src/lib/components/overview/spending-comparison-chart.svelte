<script lang="ts">
  import type { MyOverview } from '@dukat/core/overview'
  import { AreaChart, Chart } from '@dukat/ui'
  import TrendDownIcon from 'phosphor-svelte/lib/TrendDown'
  import TrendUpIcon from 'phosphor-svelte/lib/TrendUp'
  import { formatMoney } from '$lib/money'

  let {
    comparison,
    currency,
    currentAmountMinor,
  }: {
    comparison: MyOverview['spendingComparison']
    currency: string
    currentAmountMinor: string | null
  } = $props()

  const config = {
    current: { label: 'This month', color: 'var(--color-primary)' },
    typical: {
      label: '3-month average',
      color: 'var(--color-muted-foreground)',
    },
  }

  let chartData = $derived(
    comparison.points.map((point) => ({
      day: point.day,
      current:
        point.currentAmountMinor === null
          ? undefined
          : Number(point.currentAmountMinor),
      typical: Number(point.typicalAmountMinor),
    })),
  )

  function formatValue(value: unknown) {
    return formatMoney(String(Math.round(Number(value))), currency)
  }

  let comparisonSummary = $derived.by(() => {
    if (comparison.differenceMinor === null || currentAmountMinor === null) {
      return { label: 'Comparison unavailable', direction: 'flat' as const }
    }
    const point = comparison.points.find(
      ({ day }) => day === comparison.asOfDay,
    )
    const typical = BigInt(point?.typicalAmountMinor ?? '0')
    const current = BigInt(currentAmountMinor)
    if (typical === 0n) {
      return {
        label:
          current === 0n
            ? 'In line with your recent average'
            : `No recent average through day ${comparison.asOfDay}`,
        direction: current === 0n ? ('flat' as const) : ('up' as const),
      }
    }
    const difference = BigInt(comparison.differenceMinor)
    if (difference === 0n) {
      return {
        label: 'In line with your recent average',
        direction: 'flat' as const,
      }
    }
    const percentage =
      ((difference < 0n ? -difference : difference) * 100n) / typical
    return {
      label: `${percentage}% ${difference < 0n ? 'more' : 'less'} than your recent average through day ${comparison.asOfDay}`,
      direction: difference < 0n ? ('up' as const) : ('down' as const),
    }
  })
</script>

{#snippet tooltipValue({ value, name }: { value: unknown; name: string })}
  <div class="flex flex-1 items-center justify-between gap-4">
    <span class="text-muted-foreground">{name}</span>
    <span class="font-mono font-medium tabular-nums">{formatValue(value)}</span>
  </div>
{/snippet}

{#if comparison.missingRate}
  <div class="flex min-h-64 items-center justify-center px-6 text-center">
    <p class="max-w-sm text-sm text-muted-foreground">
      Spending comparison is unavailable because an exchange rate is missing.
    </p>
  </div>
{:else if chartData.length === 0}
  <div class="flex min-h-64 items-center justify-center px-6 text-center">
    <p class="text-sm text-muted-foreground">No spending to compare yet.</p>
  </div>
{:else}
  <div class="px-2 pt-2" aria-hidden="true">
    <Chart.Container {config} class="h-64 w-full aspect-auto">
      <AreaChart
        data={chartData}
        x="day"
        series={[
          {
            key: 'current',
            label: config.current.label,
            value: 'current',
            color: 'var(--color-current)',
          },
          {
            key: 'typical',
            label: config.typical.label,
            value: 'typical',
            color: 'var(--color-typical)',
            props: { fillOpacity: 0.08, line: { dashArray: '5 5' } },
          },
        ]}
        seriesLayout="overlap"
        motion="none"
        padding={{ left: 72, right: 8, top: 8, bottom: 0 }}
        props={{
          area: { fillOpacity: 0.18 },
          xAxis: { ticks: 5 },
          yAxis: { ticks: 4, format: (value: unknown) => formatValue(value) },
        }}
      >
        {#snippet tooltip()}
          <Chart.Tooltip
            labelFormatter={(day) => `Day ${day}`}
            formatter={tooltipValue}
          />
        {/snippet}
      </AreaChart>
    </Chart.Container>
  </div>
  <div class="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
    <div>
      <p class="text-base font-semibold">
        {formatMoney(currentAmountMinor ?? '0', currency)} spent this month
      </p>
      <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {comparisonSummary.label}
        {#if comparisonSummary.direction === 'up'}
          <TrendUpIcon class="size-4" aria-hidden="true" />
        {:else if comparisonSummary.direction === 'down'}
          <TrendDownIcon class="size-4" aria-hidden="true" />
        {/if}
      </p>
    </div>
    <p class="text-xs text-muted-foreground">
      Compared with the previous 3 months
    </p>
  </div>
  <p class="sr-only">
    Cumulative spending through day {comparison.asOfDay}, compared with the
    average of the previous three complete months.
  </p>
{/if}
