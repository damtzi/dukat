<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Account } from '@dukat/core/ledger'
  import { Sidebar } from '@dukat/ui'
  import ArrowLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRight'
  import FileUpIcon from 'phosphor-svelte/lib/FileArrowUp'
  import SettingsIcon from 'phosphor-svelte/lib/GearSix'
  import HomeIcon from 'phosphor-svelte/lib/House'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import LayoutDashboardIcon from 'phosphor-svelte/lib/SquaresFour'
  import TagIcon from 'phosphor-svelte/lib/Tag'
  import UserIcon from 'phosphor-svelte/lib/UserCircle'
  import SharedIcon from 'phosphor-svelte/lib/UsersThree'
  import WalletIcon from 'phosphor-svelte/lib/Wallet'
  import { formatMoney } from '$lib/money'
  import type {
    Workspace,
    WorkspaceRouteData,
  } from '$lib/controllers/workspace-controller.svelte'

  let { workspaces }: { workspaces: Workspace[] } = $props()

  const sidebar = Sidebar.useSidebar()
  let personalWorkspaces = $derived(
    workspaces.filter(({ type }) => type === 'personal'),
  )
  let sharedWorkspaces = $derived(
    workspaces.filter(({ type }) => type === 'household'),
  )
  let workspaceId = $derived(page.params.workspaceId ?? '')
  let accounts = $derived<Account[]>(
    workspaceId
      ? ((page.data as Partial<WorkspaceRouteData>).accounts ?? [])
      : [],
  )
  let activeWorkspace = $derived(
    workspaces.find(({ id }) => id === workspaceId) ?? null,
  )
  let routeId = $derived(page.route.id)
  let accountsActive = $derived(
    routeId?.startsWith('/(app)/workspaces/[workspaceId]/accounts') ?? false,
  )

  function closeMobile() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }
</script>

<Sidebar.Root variant="inset" collapsible="icon">
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" tooltipContent="Home">
          {#snippet child({ props })}
            <a
              {...props}
              href={resolve('/home')}
              aria-current={routeId === '/(app)/home' ? 'page' : undefined}
              onclick={closeMobile}
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                >D</span
              >
              <span class="flex min-w-0 flex-col leading-tight">
                <span class="truncate font-semibold">Dukat</span>
                <span class="truncate text-xs text-sidebar-foreground/70">
                  Personal finance
                </span>
              </span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Navigate</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={routeId === '/(app)/home'}
              tooltipContent="Home"
            >
              {#snippet child({ props })}
                <a
                  {...props}
                  href={resolve('/home')}
                  aria-current={routeId === '/(app)/home' ? 'page' : undefined}
                  onclick={closeMobile}
                >
                  <HomeIcon aria-hidden="true" />
                  <span>Home</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if personalWorkspaces.length > 0}
      <Sidebar.Group>
        <Sidebar.GroupLabel>Personal</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each personalWorkspaces as workspace (workspace.id)}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={workspaceId === workspace.id}
                  tooltipContent={workspace.name}
                >
                  {#snippet child({ props })}
                    <a
                      {...props}
                      href={resolve('/(app)/workspaces/[workspaceId]', {
                        workspaceId: workspace.id,
                      })}
                      aria-current={routeId ===
                        '/(app)/workspaces/[workspaceId]' &&
                      workspaceId === workspace.id
                        ? 'page'
                        : undefined}
                      onclick={closeMobile}
                    >
                      <WalletIcon aria-hidden="true" />
                      <span>{workspace.name}</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    {/if}

    <Sidebar.Group>
      <Sidebar.GroupLabel>Shared</Sidebar.GroupLabel>
      <Sidebar.GroupAction title="Create shared workspace">
        {#snippet child({ props })}
          <a
            {...props}
            href={resolve('/workspaces/new')}
            aria-label="Create shared workspace"
            onclick={closeMobile}
          >
            <PlusIcon aria-hidden="true" />
          </a>
        {/snippet}
      </Sidebar.GroupAction>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each sharedWorkspaces as workspace (workspace.id)}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={workspaceId === workspace.id}
                tooltipContent={workspace.name}
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/(app)/workspaces/[workspaceId]', {
                      workspaceId: workspace.id,
                    })}
                    aria-current={routeId ===
                      '/(app)/workspaces/[workspaceId]' &&
                    workspaceId === workspace.id
                      ? 'page'
                      : undefined}
                    onclick={closeMobile}
                  >
                    <SharedIcon aria-hidden="true" />
                    <span>{workspace.name}</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if activeWorkspace}
      <Sidebar.Group>
        <Sidebar.GroupLabel>{activeWorkspace.name}</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={routeId === '/(app)/workspaces/[workspaceId]'}
                tooltipContent="Overview"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/(app)/workspaces/[workspaceId]', {
                      workspaceId,
                    })}
                    aria-current={routeId === '/(app)/workspaces/[workspaceId]'
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

            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={accountsActive}
                tooltipContent="Accounts"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/(app)/workspaces/[workspaceId]/accounts', {
                      workspaceId,
                    })}
                    aria-current={routeId ===
                    '/(app)/workspaces/[workspaceId]/accounts'
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
                <Sidebar.MenuSub>
                  {#each accounts as account (account.id)}
                    <Sidebar.MenuSubItem>
                      <Sidebar.MenuSubButton
                        isActive={page.params.accountId === account.id}
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
                            <span class="truncate">
                              {account.name}{account.archivedAt
                                ? ' · Archived'
                                : ''}
                            </span>
                            <span
                              class="ml-auto shrink-0 text-sidebar-foreground/70"
                            >
                              {formatMoney(
                                account.balanceMinor,
                                account.currency,
                              )}
                            </span>
                          </a>
                        {/snippet}
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSubItem>
                  {/each}
                </Sidebar.MenuSub>
              {/if}
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={routeId ===
                  '/(app)/workspaces/[workspaceId]/categories'}
                tooltipContent="Categories"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve(
                      '/(app)/workspaces/[workspaceId]/categories',
                      { workspaceId },
                    )}
                    aria-current={routeId ===
                    '/(app)/workspaces/[workspaceId]/categories'
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
                isActive={routeId === '/(app)/workspaces/[workspaceId]/imports'}
                tooltipContent="CSV imports"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/(app)/workspaces/[workspaceId]/imports', {
                      workspaceId,
                    })}
                    aria-current={routeId ===
                    '/(app)/workspaces/[workspaceId]/imports'
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
                isActive={routeId === '/(app)/workspaces/[workspaceId]/rates'}
                tooltipContent="Exchange rates"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/(app)/workspaces/[workspaceId]/rates', {
                      workspaceId,
                    })}
                    aria-current={routeId ===
                    '/(app)/workspaces/[workspaceId]/rates'
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
                isActive={routeId === '/(app)/workspaces/[workspaceId]/manage'}
                tooltipContent="Manage workspace"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/(app)/workspaces/[workspaceId]/manage', {
                      workspaceId,
                    })}
                    aria-current={routeId ===
                    '/(app)/workspaces/[workspaceId]/manage'
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
        </Sidebar.GroupContent>
      </Sidebar.Group>
    {/if}
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={routeId === '/(app)/settings'}
          tooltipContent="Settings"
        >
          {#snippet child({ props })}
            <a
              {...props}
              href={resolve('/settings')}
              aria-current={routeId === '/(app)/settings' ? 'page' : undefined}
              onclick={closeMobile}
            >
              <SettingsIcon aria-hidden="true" />
              <span>Settings</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={routeId === '/(app)/profile'}
          tooltipContent="Profile"
        >
          {#snippet child({ props })}
            <a
              {...props}
              href={resolve('/profile')}
              aria-current={routeId === '/(app)/profile' ? 'page' : undefined}
              onclick={closeMobile}
            >
              <UserIcon aria-hidden="true" />
              <span>Profile</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
