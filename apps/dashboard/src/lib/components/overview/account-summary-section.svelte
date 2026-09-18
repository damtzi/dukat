<script lang="ts">
  import { resolve } from '$app/paths'
  import type { MyOverview } from '@dukat/core/overview'
  import { Badge, Button, Card } from '@dukat/ui'
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import { accountTypeLabel, formatAccountBalance } from '$lib/account'
  import SectionHeader from '$lib/components/dashboard/section-header.svelte'

  let {
    accounts,
    personalWorkspaceId,
  }: {
    accounts: MyOverview['accounts']
    personalWorkspaceId?: string
  } = $props()
</script>

<section class="flex flex-col gap-3" aria-labelledby="accounts-title">
  <SectionHeader
    id="accounts-title"
    title="Accounts"
    description="The balances you can use or owe, in their original currencies."
  />
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {#each accounts as account (account.id)}
      <Card.Root class="flex min-h-44 flex-col">
        <Card.Header class="flex-1">
          <div class="flex items-start justify-between gap-3">
            <Card.Title class="truncate">{account.name}</Card.Title>
            {#if account.archivedAt}
              <Badge variant="secondary">Archived</Badge>
            {/if}
          </div>
          <Card.Description>
            {accountTypeLabel(account.type)} · {account.workspaceName}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-xl font-semibold">{formatAccountBalance(account)}</p>
        </Card.Content>
        <Card.Footer>
          <Button
            class="h-auto px-0"
            variant="link"
            href={resolve(
              '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
              { workspaceId: account.workspaceId, accountId: account.id },
            )}>Go to account <ArrowRightIcon aria-hidden="true" /></Button
          >
        </Card.Footer>
      </Card.Root>
    {/each}
    {#if personalWorkspaceId}
      <a
        class="flex min-h-44 flex-col items-center justify-center gap-3 border border-dashed p-6 text-center text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground"
        href={resolve('/(app)/workspaces/[workspaceId]/accounts', {
          workspaceId: personalWorkspaceId,
        })}
      >
        <span class="flex size-9 items-center justify-center border">
          <PlusIcon aria-hidden="true" />
        </span>
        <span>
          <strong class="block text-sm font-medium">New account</strong>
          <span class="mt-1 block text-xs">Add one in Personal</span>
        </span>
      </a>
    {/if}
  </div>
</section>
