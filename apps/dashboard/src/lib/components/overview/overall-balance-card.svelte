<script lang="ts">
  import type { MyOverview } from '@dukat/core/overview'
  import { Card } from '@dukat/ui'
  import { formatMoney } from '$lib/money'

  let { overview }: { overview: MyOverview } = $props()

  let composition = $derived.by(() => {
    if (
      overview.personalAvailableMoney.amountMinor === null ||
      overview.householdAvailableMoney.amountMinor === null
    ) {
      return null
    }
    const personal = BigInt(overview.personalAvailableMoney.amountMinor)
    const shared = BigInt(overview.householdAvailableMoney.amountMinor)
    const hasMixedSigns =
      (personal < 0n && shared > 0n) || (personal > 0n && shared < 0n)
    if (hasMixedSigns) return { personalPercent: null, sharedPercent: null }
    const personalMagnitude = personal < 0n ? -personal : personal
    const sharedMagnitude = shared < 0n ? -shared : shared
    const total = personalMagnitude + sharedMagnitude
    if (total === 0n) return { personalPercent: 0, sharedPercent: 0 }
    const personalPercent = Number((personalMagnitude * 1000n) / total) / 10
    return { personalPercent, sharedPercent: 100 - personalPercent }
  })

  function totalLabel(total: MyOverview['availableMoney']) {
    return total.amountMinor === null
      ? 'Unavailable'
      : formatMoney(total.amountMinor, overview.reportingCurrency)
  }
</script>

<Card.Root aria-labelledby="available-money-title">
  <Card.Content
    class="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-center"
  >
    <div>
      <p
        id="available-money-title"
        class="text-sm font-medium text-muted-foreground"
      >
        Available money
      </p>
      <p class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {totalLabel(overview.availableMoney)}
      </p>
      <p class="mt-2 text-sm text-muted-foreground">
        Cash, current accounts, and savings you can access
      </p>
    </div>
    <div class="flex flex-col gap-3">
      <p class="text-xs font-medium text-muted-foreground">
        Balance composition
      </p>
      <div
        class="flex h-2 overflow-hidden bg-muted"
        role="img"
        aria-label={composition && composition.personalPercent !== null
          ? `${composition.personalPercent}% Personal and ${composition.sharedPercent}% Shared`
          : composition
            ? 'Personal and Shared balances have opposite signs'
            : 'Balance composition unavailable'}
      >
        {#if composition && composition.personalPercent !== null}
          <span
            class="bg-primary"
            style:width={`${composition.personalPercent}%`}
          ></span>
          <span
            class="bg-primary/30"
            style:width={`${composition.sharedPercent}%`}
          ></span>
        {/if}
      </div>
      {#if composition?.personalPercent === null}
        <p class="text-xs text-muted-foreground">
          Mixed positive and negative balances cannot be shown as shares.
        </p>
      {/if}
      <dl class="grid grid-cols-2 gap-4">
        <div>
          <dt class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="size-2 bg-primary"></span>Personal
            {#if composition && composition.personalPercent !== null}
              <span>{composition.personalPercent}%</span>
            {/if}
          </dt>
          <dd class="mt-1 font-semibold">
            {totalLabel(overview.personalAvailableMoney)}
          </dd>
        </div>
        <div>
          <dt class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="size-2 bg-primary/30"></span>Shared
            {#if composition && composition.sharedPercent !== null}
              <span>{composition.sharedPercent}%</span>
            {/if}
          </dt>
          <dd class="mt-1 font-semibold">
            {totalLabel(overview.householdAvailableMoney)}
          </dd>
        </div>
      </dl>
    </div>
  </Card.Content>
</Card.Root>
