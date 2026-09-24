<script lang="ts">
  import { resolve } from '$app/paths'
  import type { MyOverview } from '@dukat/core/overview'
  import { Badge, Button, Card } from '@dukat/ui'
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight'
  import SectionHeader from '$lib/components/dashboard/section-header.svelte'
  import { formatDate } from '$lib/i18n'
  import { formatMoney } from '$lib/money'

  let {
    obligations,
  }: {
    obligations: MyOverview['cardObligations']
  } = $props()

  const dateLabel = (date: string) => formatDate(new Date(`${date}T12:00:00Z`))
</script>

{#if obligations.length > 0}
  <section class="flex flex-col gap-3" aria-labelledby="card-obligations-title">
    <SectionHeader
      id="card-obligations-title"
      title="Credit card payments"
      description="Upcoming obligations, separate from Available money."
    />
    <Card.Root>
      <Card.Content class="divide-y pt-6">
        {#each obligations as obligation (obligation.accountId)}
          <div
            class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium">{obligation.accountName}</p>
                <Badge
                  variant={obligation.status === 'overdue'
                    ? 'destructive'
                    : 'secondary'}
                >
                  {obligation.status === 'overdue' ? 'Overdue' : 'Payment due'}
                </Badge>
              </div>
              <p class="text-sm text-muted-foreground">
                {obligation.paymentDueDate
                  ? `Due ${dateLabel(obligation.paymentDueDate)}`
                  : 'Due date not set'} · {obligation.workspaceName}
              </p>
            </div>
            <div class="flex items-center justify-between gap-4 sm:justify-end">
              <p class="text-lg font-semibold tabular-nums">
                {formatMoney(obligation.amountMinor, obligation.currency)}
              </p>
              <Button
                class="h-auto px-0"
                variant="link"
                href={resolve(
                  '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
                  {
                    workspaceId: obligation.workspaceId,
                    accountId: obligation.accountId,
                  },
                )}>View <ArrowRightIcon aria-hidden="true" /></Button
              >
            </div>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  </section>
{/if}
