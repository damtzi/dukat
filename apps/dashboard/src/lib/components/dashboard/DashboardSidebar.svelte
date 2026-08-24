<script lang="ts" module>
  export type DashboardView =
    | 'overview'
    | 'account'
    | 'categories'
    | 'imports'
    | 'rates'
    | 'settings'

  export type AccountTab = 'activity' | 'planning' | 'reconciliation'
</script>

<script lang="ts">
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
    activeView,
    accountTab,
    onworkspace,
    onnavigate,
    onaccounttab,
    onselectaccount,
    onnewaccount,
  }: {
    workspaces: Workspace[]
    workspaceId: string
    accounts: Account[]
    selectedId: string
    activeView: DashboardView
    accountTab: AccountTab
    onworkspace: (id: string) => void
    onnavigate: (view: DashboardView) => void
    onaccounttab: (tab: AccountTab) => void
    onselectaccount: (id: string) => void
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

  function navigate(view: DashboardView) {
    onnavigate(view)
    closeMobile()
  }

  function openAccountTab(tab: AccountTab) {
    onaccounttab(tab)
    closeMobile()
  }

  function selectAccount(id: string) {
    onselectaccount(id)
    closeMobile()
  }
</script>

<Sidebar.Root variant="inset" collapsible="icon">
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          size="lg"
          tooltipContent="Overview"
          onclick={() => navigate('overview')}
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
              isActive={activeView === 'overview'}
              tooltipContent="Overview"
              onclick={() => navigate('overview')}
            >
              <LayoutDashboardIcon />
              <span>Overview</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={activeView === 'account' && accountTab === 'activity'}
              tooltipContent="Transactions"
              onclick={() => openAccountTab('activity')}
            >
              <ReceiptTextIcon />
              <span>Transactions</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={activeView === 'account' && accountTab === 'planning'}
              tooltipContent="Planning"
              onclick={() => openAccountTab('planning')}
            >
              <CalendarClockIcon />
              <span>Planning</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
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
                isActive={activeView === 'account' && selectedId === account.id}
                tooltipContent={`${account.name} · ${formatMoney(account.balanceMinor, account.currency)}`}
                onclick={() => selectAccount(account.id)}
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
                    >{formatMoney(account.balanceMinor, account.currency)}</span
                  >
                </span>
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
              isActive={activeView === 'categories'}
              tooltipContent="Categories"
              onclick={() => navigate('categories')}
            >
              <TagIcon />
              <span>Categories</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={activeView === 'imports'}
              tooltipContent="CSV imports"
              onclick={() => navigate('imports')}
            >
              <FileUpIcon />
              <span>CSV imports</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={activeView === 'rates'}
              tooltipContent="Exchange rates"
              onclick={() => navigate('rates')}
            >
              <ArrowLeftRightIcon />
              <span>Exchange rates</span>
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
          isActive={activeView === 'settings'}
          tooltipContent="Settings"
          onclick={() => navigate('settings')}
        >
          <SettingsIcon />
          <span>Settings</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
