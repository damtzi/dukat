<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Account } from '@dukat/core/ledger'
  import { DropdownMenu, Sidebar, Spinner, toast } from '@dukat/ui'
  import CaretUpDownIcon from 'phosphor-svelte/lib/CaretUpDown'
  import SettingsIcon from 'phosphor-svelte/lib/GearSix'
  import HomeIcon from 'phosphor-svelte/lib/House'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import SignOutIcon from 'phosphor-svelte/lib/SignOut'
  import UserIcon from 'phosphor-svelte/lib/UserCircle'
  import { api } from '$lib/api'
  import HouseholdNavigation from '$lib/components/dashboard/household-navigation.svelte'
  import ProfileImage from '$lib/components/profile/profile-image.svelte'
  import WorkspaceNavigation from '$lib/components/dashboard/workspace-navigation.svelte'
  import type {
    Workspace,
    WorkspaceRouteData,
  } from '$lib/controllers/workspace-controller.svelte'
  import type { SessionUser } from '$lib/session'

  let {
    user,
    workspaces,
    personalAccounts,
  }: {
    user: SessionUser
    workspaces: Workspace[]
    personalAccounts: Account[]
  } = $props()

  const sidebar = Sidebar.useSidebar()
  let accountMenuOpen = $state(false)
  let logoutPending = $state(false)
  let personalAccountsOpen = $state(true)
  let personalWorkspace = $derived(
    workspaces.find(({ type }) => type === 'personal') ?? null,
  )
  let sharedWorkspaces = $derived(
    workspaces.filter(({ type }) => type === 'household'),
  )
  let routeWorkspaceId = $derived(page.params.workspaceId ?? '')
  let routeAccounts = $derived<Account[]>(
    routeWorkspaceId
      ? ((page.data as Partial<WorkspaceRouteData>).accounts ?? [])
      : [],
  )
  let routeId = $derived(page.route.id)
  let displayName = $derived(
    user.name || user.username || user.email || 'Account',
  )
  let displayEmail = $derived(user.email || '')

  function closeMobile() {
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }

  function closeAccountMenu() {
    accountMenuOpen = false
    closeMobile()
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
                class="flex size-8 shrink-0 items-center justify-center bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
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

    {#if personalWorkspace}
      <Sidebar.Group>
        <Sidebar.GroupLabel>Personal</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <WorkspaceNavigation
            workspace={personalWorkspace}
            accounts={personalAccounts}
            bind:accountsOpen={personalAccountsOpen}
          />
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
            <HouseholdNavigation
              {workspace}
              accounts={routeWorkspaceId === workspace.id ? routeAccounts : []}
              active={routeWorkspaceId === workspace.id}
            />
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <DropdownMenu.Root bind:open={accountMenuOpen}>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuButton
                {...props}
                size="lg"
                aria-label="Account menu"
              >
                <ProfileImage
                  image={user.image}
                  name={displayName}
                  size="compact"
                />
                <span
                  class="flex min-w-0 flex-1 flex-col text-left leading-tight"
                >
                  <span class="truncate font-semibold">{displayName}</span>
                  <span class="truncate text-xs text-sidebar-foreground/70">
                    {displayEmail}
                  </span>
                </span>
                <CaretUpDownIcon class="ml-auto" aria-hidden="true" />
              </Sidebar.MenuButton>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="min-w-56"
            side="top"
            align="end"
            sideOffset={4}
          >
            <DropdownMenu.Label class="p-0 font-normal">
              <span class="flex items-center gap-2 px-2 py-2 text-left">
                <ProfileImage
                  image={user.image}
                  name={displayName}
                  size="compact"
                />
                <span class="flex min-w-0 flex-1 flex-col leading-tight">
                  <span class="truncate font-semibold">{displayName}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {displayEmail}
                  </span>
                </span>
              </span>
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Group>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/profile')}
                    onclick={closeAccountMenu}
                  >
                    <UserIcon aria-hidden="true" />
                    <span>Profile</span>
                  </a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a
                    {...props}
                    href={resolve('/settings')}
                    onclick={closeAccountMenu}
                  >
                    <SettingsIcon aria-hidden="true" />
                    <span>Settings</span>
                  </a>
                {/snippet}
              </DropdownMenu.Item>
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.Group>
              <DropdownMenu.Item disabled={logoutPending} onSelect={logout}>
                {#if logoutPending}
                  <Spinner aria-hidden="true" />
                {:else}
                  <SignOutIcon aria-hidden="true" />
                {/if}
                <span>{logoutPending ? 'Signing out…' : 'Log out'}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
