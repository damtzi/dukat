<script lang="ts">
  import { goto, invalidate } from '$app/navigation'
  import { base, resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Account } from '@dukat/core/ledger'
  import { Sidebar, Spinner, toast } from '@dukat/ui'
  import ArrowLeftRightIcon from 'phosphor-svelte/lib/ArrowsLeftRight'
  import ChartBarIcon from 'phosphor-svelte/lib/ChartBar'
  import FileUpIcon from 'phosphor-svelte/lib/FileArrowUp'
  import SettingsIcon from 'phosphor-svelte/lib/GearSix'
  import HomeIcon from 'phosphor-svelte/lib/House'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import StarIcon from 'phosphor-svelte/lib/Star'
  import LayoutDashboardIcon from 'phosphor-svelte/lib/SquaresFour'
  import TagIcon from 'phosphor-svelte/lib/Tag'
  import UserIcon from 'phosphor-svelte/lib/UserCircle'
  import SharedIcon from 'phosphor-svelte/lib/UsersThree'
  import SignOutIcon from 'phosphor-svelte/lib/SignOut'
  import WalletIcon from 'phosphor-svelte/lib/Wallet'
  import { api } from '$lib/api'
  import FavoriteAction from '$lib/components/dashboard/FavoriteAction.svelte'
  import { formatMoney } from '$lib/money'
  import type {
    Workspace,
    WorkspaceRouteData,
  } from '$lib/controllers/workspace-controller.svelte'
  import { favoritesDataDependency, type Favorite } from '$lib/favorites'

  let {
    workspaces,
    favorites,
    favoritesError,
  }: {
    workspaces: Workspace[]
    favorites: Favorite[]
    favoritesError: string
  } = $props()

  const sidebar = Sidebar.useSidebar()
  let pendingFavoritePath = $state('')
  let favoriteMessage = $state('')
  let logoutPending = $state(false)
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
  let visibleFavoriteError = $derived(favoriteMessage || favoritesError)

  function closeMobile() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }

  function favoriteFor(path: string) {
    return favorites.find((favorite) => favorite.path === path)
  }

  async function toggleFavorite(path: string, label: string) {
    if (pendingFavoritePath) return
    pendingFavoritePath = path
    favoriteMessage = ''
    try {
      const favorite = favoriteFor(path)
      if (favorite) {
        await api(`/favorites/${encodeURIComponent(favorite.id)}`, {
          method: 'DELETE',
        })
      } else {
        await api('/favorites', {
          method: 'POST',
          body: JSON.stringify({ path, label }),
        })
      }
      await invalidate(favoritesDataDependency)
    } catch (error) {
      favoriteMessage = (error as Error).message
    } finally {
      pendingFavoritePath = ''
    }
  }

  async function logout() {
    if (logoutPending) return
    logoutPending = true
    try {
      await api('/auth/sign-out', { method: 'POST' })
      await goto(resolve('/sign-in'), { replaceState: true })
    } catch (error) {
      toast.error((error as Error).message, {
        action: { label: 'Try again', onClick: logout },
      })
    } finally {
      logoutPending = false
    }
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

    {#if favorites.length > 0 || visibleFavoriteError}
      <Sidebar.Group aria-label="Favorites">
        <Sidebar.GroupLabel>Favorites</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          {#if visibleFavoriteError}
            <p class="px-2 text-xs text-destructive" role="alert">
              {visibleFavoriteError}
            </p>
          {/if}
          {#if favorites.length > 0}
            <Sidebar.Menu>
              {#each favorites as favorite (favorite.id)}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton
                    isActive={page.url.pathname === favorite.path}
                    tooltipContent={favorite.label}
                  >
                    {#snippet child({ props })}
                      <a
                        {...props}
                        href={`${base}${favorite.path}`}
                        aria-current={page.url.pathname === favorite.path
                          ? 'page'
                          : undefined}
                        onclick={closeMobile}
                      >
                        <StarIcon weight="fill" aria-hidden="true" />
                        <span>{favorite.label}</span>
                      </a>
                    {/snippet}
                  </Sidebar.MenuButton>
                  <FavoriteAction
                    active
                    showOnHover
                    pending={pendingFavoritePath === favorite.path}
                    path={favorite.path}
                    label={favorite.label}
                    ontoggle={toggleFavorite}
                  />
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          {/if}
        </Sidebar.GroupContent>
      </Sidebar.Group>
    {/if}

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
      {@const overviewPath = resolve('/(app)/workspaces/[workspaceId]', {
        workspaceId,
      })}
      {@const accountsPath = resolve(
        '/(app)/workspaces/[workspaceId]/accounts',
        { workspaceId },
      )}
      {@const cashFlowPath = resolve(
        '/(app)/workspaces/[workspaceId]/cash-flow',
        { workspaceId },
      )}
      {@const categoriesPath = resolve(
        '/(app)/workspaces/[workspaceId]/categories',
        { workspaceId },
      )}
      {@const importsPath = resolve('/(app)/workspaces/[workspaceId]/imports', {
        workspaceId,
      })}
      {@const ratesPath = resolve('/(app)/workspaces/[workspaceId]/rates', {
        workspaceId,
      })}
      {@const managePath = resolve('/(app)/workspaces/[workspaceId]/manage', {
        workspaceId,
      })}
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
                    href={overviewPath}
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
              <FavoriteAction
                active={favoriteFor(overviewPath) !== undefined}
                pending={pendingFavoritePath === overviewPath}
                path={overviewPath}
                label={`${activeWorkspace.name} · Overview`}
                ontoggle={toggleFavorite}
              />
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={routeId ===
                  '/(app)/workspaces/[workspaceId]/cash-flow'}
                tooltipContent="Cash flow"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={cashFlowPath}
                    aria-current={routeId ===
                    '/(app)/workspaces/[workspaceId]/cash-flow'
                      ? 'page'
                      : undefined}
                    onclick={closeMobile}
                  >
                    <ChartBarIcon aria-hidden="true" />
                    <span>Cash flow</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
              <FavoriteAction
                active={favoriteFor(cashFlowPath) !== undefined}
                pending={pendingFavoritePath === cashFlowPath}
                path={cashFlowPath}
                label={`${activeWorkspace.name} · Cash flow`}
                ontoggle={toggleFavorite}
              />
            </Sidebar.MenuItem>

            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={accountsActive}
                tooltipContent="Accounts"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={accountsPath}
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
              <FavoriteAction
                active={favoriteFor(accountsPath) !== undefined}
                pending={pendingFavoritePath === accountsPath}
                path={accountsPath}
                label={`${activeWorkspace.name} · Accounts`}
                ontoggle={toggleFavorite}
              />
              {#if accounts.length > 0}
                <Sidebar.MenuSub>
                  {#each accounts as account (account.id)}
                    {@const accountPath = resolve(
                      '/(app)/workspaces/[workspaceId]/accounts/[accountId]/activity',
                      { workspaceId, accountId: account.id },
                    )}
                    <Sidebar.MenuSubItem>
                      <Sidebar.MenuSubButton
                        class="pr-7"
                        isActive={page.params.accountId === account.id}
                      >
                        {#snippet child({ props })}
                          <a
                            {...props}
                            href={accountPath}
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
                      <FavoriteAction
                        submenu
                        active={favoriteFor(accountPath) !== undefined}
                        pending={pendingFavoritePath === accountPath}
                        path={accountPath}
                        label={`${activeWorkspace.name} · ${account.name}`}
                        ontoggle={toggleFavorite}
                      />
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
                    href={categoriesPath}
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
              <FavoriteAction
                active={favoriteFor(categoriesPath) !== undefined}
                pending={pendingFavoritePath === categoriesPath}
                path={categoriesPath}
                label={`${activeWorkspace.name} · Categories`}
                ontoggle={toggleFavorite}
              />
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={routeId === '/(app)/workspaces/[workspaceId]/imports'}
                tooltipContent="CSV imports"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={importsPath}
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
              <FavoriteAction
                active={favoriteFor(importsPath) !== undefined}
                pending={pendingFavoritePath === importsPath}
                path={importsPath}
                label={`${activeWorkspace.name} · CSV imports`}
                ontoggle={toggleFavorite}
              />
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={routeId === '/(app)/workspaces/[workspaceId]/rates'}
                tooltipContent="Exchange rates"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={ratesPath}
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
              <FavoriteAction
                active={favoriteFor(ratesPath) !== undefined}
                pending={pendingFavoritePath === ratesPath}
                path={ratesPath}
                label={`${activeWorkspace.name} · Exchange rates`}
                ontoggle={toggleFavorite}
              />
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={routeId === '/(app)/workspaces/[workspaceId]/manage'}
                tooltipContent="Manage workspace"
              >
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={managePath}
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
              <FavoriteAction
                active={favoriteFor(managePath) !== undefined}
                pending={pendingFavoritePath === managePath}
                path={managePath}
                label={`${activeWorkspace.name} · Manage workspace`}
                ontoggle={toggleFavorite}
              />
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
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          tooltipContent={logoutPending ? 'Signing out…' : 'Log out'}
          aria-label={logoutPending ? 'Signing out…' : 'Log out'}
          onclick={logout}
        >
          {#snippet child({ props })}
            <button {...props} type="button" disabled={logoutPending}>
              {#if logoutPending}<Spinner
                  aria-hidden="true"
                />{:else}<SignOutIcon aria-hidden="true" />{/if}
              <span>{logoutPending ? 'Signing out…' : 'Log out'}</span>
            </button>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
