<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Account } from '@dukat/core/ledger'
  import { Collapsible, Sidebar } from '@dukat/ui'
  import ArrowLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRight'
  import ChartBarIcon from 'phosphor-svelte/lib/ChartBar'
  import ChartLineIcon from 'phosphor-svelte/lib/ChartLine'
  import FileUpIcon from 'phosphor-svelte/lib/FileArrowUp'
  import SettingsIcon from 'phosphor-svelte/lib/GearSix'
  import MinusIcon from 'phosphor-svelte/lib/Minus'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import ReceiptIcon from 'phosphor-svelte/lib/Receipt'
  import LayoutDashboardIcon from 'phosphor-svelte/lib/SquaresFour'
  import PiggyBankIcon from 'phosphor-svelte/lib/PiggyBank'
  import TagIcon from 'phosphor-svelte/lib/Tag'
  import WalletIcon from 'phosphor-svelte/lib/Wallet'
  import { formatAccountBalance } from '$lib/account'
  import type { Workspace } from '$lib/controllers/workspace-controller.svelte'

  let {
    workspace,
    accounts,
    accountsOpen = $bindable(true),
  }: {
    workspace: Workspace
    accounts: Account[]
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
  let cashFlowPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/cash-flow', { workspaceId }),
  )
  let forecastPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/forecast', { workspaceId }),
  )
  let categoriesPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/categories', { workspaceId }),
  )
  let budgetsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/budgets', { workspaceId }),
  )
  let importsPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/imports', { workspaceId }),
  )
  let ratesPath = $derived(
    resolve('/(app)/workspaces/[workspaceId]/rates', { workspaceId }),
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

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/forecast'}
      tooltipContent="Forecast"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={forecastPath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/forecast'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <ChartLineIcon aria-hidden="true" />
          <span>Forecast</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/cash-flow'}
      tooltipContent="Cash flow"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={cashFlowPath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/cash-flow'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <ChartBarIcon aria-hidden="true" />
          <span>Cash flow</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/transactions'}
      tooltipContent="Transactions"
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
          <span>Transactions</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/categories'}
      tooltipContent="Categories"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={categoriesPath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/categories'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <TagIcon aria-hidden="true" />
          <span>Categories</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/imports'}
      tooltipContent="CSV imports"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={importsPath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/imports'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <FileUpIcon aria-hidden="true" />
          <span>CSV imports</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/rates'}
      tooltipContent="Exchange rates"
    >
      {#snippet child({ props })}
        <a
          {...props}
          href={ratesPath}
          aria-current={workspaceActive &&
          routeId === '/(app)/workspaces/[workspaceId]/rates'
            ? 'page'
            : undefined}
          onclick={closeMobile}
        >
          <ArrowLeftRightIcon aria-hidden="true" />
          <span>Exchange rates</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>

  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      isActive={workspaceActive &&
        routeId === '/(app)/workspaces/[workspaceId]/manage'}
      tooltipContent="Manage workspace"
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
          <span>Manage workspace</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
</Sidebar.Menu>
