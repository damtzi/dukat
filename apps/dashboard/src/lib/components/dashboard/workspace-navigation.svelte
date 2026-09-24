<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Account } from '@dukat/core/ledger'
  import { Collapsible, Sidebar } from '@dukat/ui'
  import SettingsIcon from 'phosphor-svelte/lib/GearSix'
  import MinusIcon from 'phosphor-svelte/lib/Minus'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import ReceiptIcon from 'phosphor-svelte/lib/Receipt'
  import LayoutDashboardIcon from 'phosphor-svelte/lib/SquaresFour'
  import PiggyBankIcon from 'phosphor-svelte/lib/PiggyBank'
  import WalletIcon from 'phosphor-svelte/lib/Wallet'
  import { formatAccountBalance } from '$lib/account'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'

  let {
    workspace,
    accounts,
    hasBudgets,
    accountsOpen = $bindable(true),
  }: {
    workspace: Workspace
    accounts: Account[]
    hasBudgets: boolean
    accountsOpen?: boolean
  } = $props()

  const sidebar = Sidebar.useSidebar()
  let workspaceId = $derived(workspace.id)
  let routeId = $derived(page.route.id)
  let workspaceActive = $derived(page.params.workspaceId === workspaceId)
  let accountsActive = $derived(
    workspaceActive &&
      (routeId?.startsWith('/(app)/workspaces/[workspaceId]/accounts') ??
        false),
  )
  let overviewPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]', { workspaceId }),
  )
  let accountsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/accounts', { workspaceId }),
  )
  let transactionsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/transactions', { workspaceId }),
  )
  let budgetsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/budgets', { workspaceId }),
  )
  let managePath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/manage', { workspaceId }),
  )

  function closeMobile() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]'}
      tooltipContent="Overview"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={overviewPath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <LayoutDashboardIcon aria-hidden="true" />
          <span>Overview</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  <Collapsible.Root bind:open={accountsOpen}>
    {#snippet child({ props })}
      <Sidebar.MenuItem {...props}>
        <Sidebar.MenuButton
          class={accounts.length > 0 ? 'pr-8' : undefined}
          isActive={accountsActive}
          tooltipContent="Accounts"
        >
          {#snippet child({ props })}
            <a
              {...props}
              href={accountsPath}
              aria-current={workspaceActive &&
              routeId === '/(app)/workspaces/[workspaceId]/accounts'
                ? 'page'
                : undefined}
              onclick={closeMobile}
            >
              <WalletIcon aria-hidden="true" />
              <span>Accounts</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
        {#if accounts.length > 0}
          <Collapsible.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuAction
                {...props}
                aria-label={`${accountsOpen ? 'Collapse' : 'Expand'} ${workspace.name} accounts`}
                title={`${accountsOpen ? 'Collapse' : 'Expand'} ${workspace.name} accounts`}
              >
                {#if accountsOpen}
                  <MinusIcon aria-hidden="true" />
                {:else}
                  <PlusIcon aria-hidden="true" />
                {/if}
              </Sidebar.MenuAction>
            {/snippet}
          </Collapsible.Trigger>
          <Collapsible.Content>
            <Sidebar.MenuSub>
              {#each accounts as account (account.id)}
                {@const accountPath = resolve(
                  '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
                  { workspaceId, accountId: account.id },
                )}
                <Sidebar.MenuSubItem>
                  <Sidebar.MenuSubButton
                    isActive={workspaceActive &&
                      page.params.accountId === account.id}
                  >
                    {#snippet child({ props })}
                      <a
                        {...props}
                        href={accountPath}
                        aria-current={workspaceActive &&
                        page.params.accountId === account.id
                          ? 'page'
                          : undefined}
                        onclick={closeMobile}
                      >
                        <span class="truncate">
                          {account.name}{account.archivedAt
                            ? ' · Archived'
                            : ''}
                        </span>
                        <span
                          class="ml-auto shrink-0 text-sidebar-foreground/70"
                        >
                          {formatAccountBalance(account)}
                        </span>
                      </a>
                    {/snippet}
                  </Sidebar.MenuSubButton>
                </Sidebar.MenuSubItem>
              {/each}
            </Sidebar.MenuSub>
          </Collapsible.Content>
        {/if}
      </Sidebar.MenuItem>
    {/snippet}
  </Collapsible.Root>

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/transactions'}
      tooltipContent="Expenses"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={transactionsPath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/transactions'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <ReceiptIcon aria-hidden="true" />
          <span>Expenses</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  {#if hasBudgets}
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        isActive={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/budgets'}
        tooltipContent="Budgets"
      >
        {#snippet child({ props })}
          <a
            {...props}
            href={budgetsPath}
            aria-current={workspaceActive &&
            routeId === '/(app)/workspaces/[workspaceId]/budgets'
              ? 'page'
              : undefined}
            onclick={closeMobile}
          >
            <PiggyBankIcon aria-hidden="true" />
            <span>Budgets</span>
          </a>
        {/snippet}
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  {/if}

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/manage'}
      tooltipContent="Manage"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={managePath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/manage'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <SettingsIcon aria-hidden="true" />
          <span>Manage</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
</Sidebar.Menu>
