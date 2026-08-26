<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Account } from '@dukat/core/ledger'
  import { Badge, Label, Select, Sidebar } from '@dukat/ui'
  import ArrowLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRight'
  import CalendarClockIcon from 'phosphor-svelte/lib/CalendarDots'
  import FileUpIcon from 'phosphor-svelte/lib/FileArrowUp'
  import SettingsIcon from 'phosphor-svelte/lib/GearSix'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import ReceiptTextIcon from 'phosphor-svelte/lib/Receipt'
  import LayoutDashboardIcon from 'phosphor-svelte/lib/SquaresFour'
  import TagIcon from 'phosphor-svelte/lib/Tag'
  import WalletCardsIcon from 'phosphor-svelte/lib/Wallet'
  import { formatMoney } from '$lib/money'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'

  let {
    workspaces,
    workspaceId,
    accounts,
    selectedId,
    onworkspace,
    onnewaccount,
  }: {
    workspaces: Workspace[]
    workspaceId: string
    accounts: Account[]
    selectedId: string
    onworkspace: (id: string) => void
    onnewaccount: () => void
  } = $props()

  const sidebar = Sidebar.useSidebar()
  let workspaceLabel = $derived.by(() => {
    const workspace = workspaces.find(({ id }) => id === workspaceId)
    if (!workspace) return 'Select a workspace'
    return `${workspace.name} — ${workspace.type === 'household' ? 'Household' : 'Personal'}`
  })

  function closeMobile() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }
</script>

<Sidebar.Root variant="inset" collapsible="icon">
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" tooltipContent="Overview">
          {#snippet child({ props })}
            <a
              {...props}
              href={resolve('/(app)/workspaces/[workspaceId]', {
                workspaceId,
              })}
              onclick={closeMobile}
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                >D</span
              >
              <span class="flex min-w-0 flex-col leading-tight">
                <span class="truncate font-semibold">Dukat</span>
                <span class="truncate text-xs text-sidebar-foreground/70"
                  >Finance workspace</span
                >
              </span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>

    {#if workspaces.length > 0}
      <div class="group-data-[collapsible=icon]:hidden">
        <Label class="sr-only" for="workspace">Workspace</Label>
        <Select.Root
          type="single"
          value={workspaceId}
          onValueChange={(value) => {
            onworkspace(value)
            closeMobile()
          }}
        >
          <Select.Trigger id="workspace" class="w-full">
            {workspaceLabel}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each workspaces as workspace (workspace.id)}
                <Select.Item
                  value={workspace.id}
                  label={`${workspace.name} — ${workspace.type === 'household' ? 'Household' : 'Personal'}`}
                >
                  {workspace.name} — {workspace.type === 'household'
                    ? 'Household'
                    : 'Personal'}
                </Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
    {/if}
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Workspace</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={page.route.id === '/(app)/workspaces/[workspaceId]'}
              tooltipContent="Overview"
            >
              {#snippet child({ props })}
                <a
                  {...props}
                  href={resolve('/(app)/workspaces/[workspaceId]', {
                    workspaceId,
                  })}
                  aria-current={page.route.id ===
                  '/(app)/workspaces/[workspaceId]'
                    ? 'page'
                    : undefined}
                  onclick={closeMobile}
                >
                  <LayoutDashboardIcon />
                  <span>Overview</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          {#if selectedId}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={page.route.id ===
                  '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity'}
                tooltipContent="Transactions"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve(
                      '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
                      { workspaceId, accountId: selectedId },
                    )}
                    aria-current={page.route.id ===
                    '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity'
                      ? 'page'
                      : undefined}
                    onclick={closeMobile}
                  >
                    <ReceiptTextIcon />
                    <span>Transactions</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={page.route.id ===
                  '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning'}
                tooltipContent="Planning"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve(
                      '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
                      { workspaceId, accountId: selectedId },
                    )}
                    aria-current={page.route.id ===
                    '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning'
                      ? 'page'
                      : undefined}
                    onclick={closeMobile}
                  >
                    <CalendarClockIcon />
                    <span>Planning</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/if}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <Sidebar.Group>
      <Sidebar.GroupLabel>Accounts</Sidebar.GroupLabel>
      {#if workspaceId}
        <Sidebar.GroupAction
          aria-label="New account"
          title="New account"
          onclick={onnewaccount}
        >
          <PlusIcon />
        </Sidebar.GroupAction>
      {/if}
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each accounts as account (account.id)}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                class="h-auto py-2.5"
                isActive={page.params.accountId === account.id}
                tooltipContent={`${account.name} · ${formatMoney(account.balanceMinor, account.currency)}`}
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve(
                      '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
                      { workspaceId, accountId: account.id },
                    )}
                    aria-current={page.params.accountId === account.id
                      ? 'page'
                      : undefined}
                    onclick={closeMobile}
                  >
                    <WalletCardsIcon />
                    <span class="flex min-w-0 flex-1 flex-col">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="truncate font-medium">{account.name}</span>
                        {#if account.archivedAt}
                          <Badge variant="secondary">Archived</Badge>
                        {/if}
                      </span>
                      <span
                        class="truncate text-xs font-normal text-sidebar-foreground/70"
                        >{formatMoney(
                          account.balanceMinor,
                          account.currency,
                        )}</span
                      >
                    </span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <Sidebar.Group>
      <Sidebar.GroupLabel>Manage</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={page.route.id ===
                '/(app)/workspaces/[workspaceId]/categories'}
              tooltipContent="Categories"
            >
              {#snippet child({ props })}
                <a
                  {...props}
                  href={resolve('/(app)/workspaces/[workspaceId]/categories', {
                    workspaceId,
                  })}
                  aria-current={page.route.id ===
                  '/(app)/workspaces/[workspaceId]/categories'
                    ? 'page'
                    : undefined}
                  onclick={closeMobile}
                >
                  <TagIcon />
                  <span>Categories</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={page.route.id ===
                '/(app)/workspaces/[workspaceId]/imports'}
              tooltipContent="CSV imports"
            >
              {#snippet child({ props })}
                <a
                  {...props}
                  href={resolve('/(app)/workspaces/[workspaceId]/imports', {
                    workspaceId,
                  })}
                  aria-current={page.route.id ===
                  '/(app)/workspaces/[workspaceId]/imports'
                    ? 'page'
                    : undefined}
                  onclick={closeMobile}
                >
                  <FileUpIcon />
                  <span>CSV imports</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={page.route.id ===
                '/(app)/workspaces/[workspaceId]/rates'}
              tooltipContent="Exchange rates"
            >
              {#snippet child({ props })}
                <a
                  {...props}
                  href={resolve('/(app)/workspaces/[workspaceId]/rates', {
                    workspaceId,
                  })}
                  aria-current={page.route.id ===
                  '/(app)/workspaces/[workspaceId]/rates'
                    ? 'page'
                    : undefined}
                  onclick={closeMobile}
                >
                  <ArrowLeftRightIcon />
                  <span>Exchange rates</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={page.route.id === '/(app)/workspaces/[workspaceId]/manage'}
          tooltipContent="Settings"
        >
          {#snippet child({ props })}
            <a
              {...props}
              href={resolve('/(app)/workspaces/[workspaceId]/manage', {
                workspaceId,
              })}
              aria-current={page.route.id ===
              '/(app)/workspaces/[workspaceId]/manage'
                ? 'page'
                : undefined}
              onclick={closeMobile}
            >
              <SettingsIcon />
              <span>Settings</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
