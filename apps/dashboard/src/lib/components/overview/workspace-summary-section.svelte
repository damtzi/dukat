<script lang="ts">
  import { resolve } from '$app/paths'
  import type { MyOverview } from '@dukat/core/overview'
  import { Button, Card } from '@dukat/ui'
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import SectionHeader from '$lib/components/dashboard/section-header.svelte'
  import { formatMoney } from '$lib/money'

  let {
    workspaces,
    reportingCurrency,
  }: {
    workspaces: MyOverview['workspaces']
    reportingCurrency: string
  } = $props()
</script>

<section class="flex flex-col gap-3" aria-labelledby="workspaces-title">
  <SectionHeader
    id="workspaces-title"
    title="Workspaces"
    description="Your personal finances and money managed with other people."
  />
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {#each workspaces as workspace (workspace.id)}
      <Card.Root
        class="flex min-h-44 flex-col"
        aria-label={workspace.type === 'personal' ? 'Personal' : 'Household'}
      >
        <Card.Header class="flex-1">
          <Card.Title>{workspace.name}</Card.Title>
          <Card.Description>
            {workspace.type === 'personal'
              ? 'Private to you'
              : 'Shared with members'}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-xl font-semibold">
            {workspace.netWorthMinor === null
              ? 'Balance unavailable'
              : formatMoney(workspace.netWorthMinor, reportingCurrency)}
          </p>
        </Card.Content>
        <Card.Footer>
          <Button
            class="h-auto px-0"
            variant="link"
            href={resolve('/(app)/workspaces/[workspaceId]', {
              workspaceId: workspace.id,
            })}>Go to workspace <ArrowRightIcon aria-hidden="true" /></Button
          >
        </Card.Footer>
      </Card.Root>
    {/each}
    <a
      class="flex min-h-44 flex-col items-center justify-center gap-3 border border-dashed p-6 text-center text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground"
      href={resolve('/workspaces/new')}
    >
      <span class="flex size-9 items-center justify-center border">
        <PlusIcon aria-hidden="true" />
      </span>
      <span>
        <strong class="block text-sm font-medium">New workspace</strong>
        <span class="mt-1 block text-xs">Create a shared space</span>
      </span>
    </a>
  </div>
</section>
