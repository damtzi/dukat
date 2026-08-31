<script lang="ts">
  import { invalidate } from '$app/navigation'
  import {
    nameValidationMessage,
    normalizeName,
    normalizeUsername,
    usernameValidationMessage,
  } from '@dukat/core/identity'
  import {
    Alert,
    Button,
    Card,
    Checkbox,
    Field,
    Input,
    Spinner,
  } from '@dukat/ui'
  import UserIcon from 'phosphor-svelte/lib/UserCircle'
  import { onDestroy, onMount } from 'svelte'
  import { workspacesDataDependency } from '$lib/api'
  import {
    api,
    type Workspace,
  } from '$lib/controllers/workspace-controller.svelte'
  import {
    getBrowserSession,
    profileInitials,
    type SessionUser,
  } from '$lib/session'

  let message = $state('')
  let pending = $state(false)
  let recoverable = $state.raw<Workspace[]>([])
  let deletionBlockers = $state.raw<{ id: string; name: string }[] | null>(null)
  let profileState = $state<'loading' | 'ready' | 'error'>('loading')
  let profileError = $state('')
  let profileNotice = $state('')
  let user = $state.raw<SessionUser | null>(null)
  let name = $state('')
  let username = $state('')
  let usernameMessage = $state('')
  let usernameState = $state<'idle' | 'checking' | 'available' | 'unavailable'>(
    'idle',
  )
  let availabilityTimer: ReturnType<typeof setTimeout> | undefined
  let availabilityRequest = 0
  const usernamePattern = '[a-z][a-z0-9_]{2,29}'
  const initials = $derived(profileInitials(name))

  onMount(loadProfile)
  onDestroy(() => clearTimeout(availabilityTimer))

  async function loadProfile() {
    profileState = 'loading'
    profileError = ''
    const result = await getBrowserSession()
    if (result.status !== 'authenticated') {
      profileError =
        result.status === 'error' ? result.message : 'Your session has ended.'
      profileState = 'error'
      return
    }
    user = result.session.user
    name = user.name
    username = user.username
    profileState = 'ready'
  }

  function checkUsername(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    username = normalizeUsername(input.value)
    clearTimeout(availabilityTimer)
    availabilityRequest += 1
    const request = availabilityRequest
    const validationMessage = usernameValidationMessage(username)
    if (!username) {
      usernameState = 'idle'
      usernameMessage = ''
      return
    }
    if (validationMessage) {
      usernameState = 'unavailable'
      usernameMessage = validationMessage
      return
    }

    usernameState = 'checking'
    usernameMessage = 'Checking username…'
    availabilityTimer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/auth/username-availability?username=${encodeURIComponent(username)}`,
        )
        if (!response.ok) throw new Error('Availability request failed.')
        const result = (await response.json()) as {
          available: boolean
          message: string
        }
        if (request !== availabilityRequest) return
        usernameState = result.available ? 'available' : 'unavailable'
        usernameMessage = result.message
      } catch {
        if (request !== availabilityRequest) return
        usernameState = 'idle'
        usernameMessage =
          'Availability could not be checked. You can still save.'
      }
    }, 350)
  }

  async function updateProfile(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    clearTimeout(availabilityTimer)
    availabilityRequest += 1
    const normalizedName = normalizeName(name)
    const normalizedUsername = normalizeUsername(username)
    const validationMessage =
      nameValidationMessage(normalizedName) ??
      usernameValidationMessage(normalizedUsername)
    profileError = ''
    profileNotice = ''
    if (validationMessage) {
      profileError = validationMessage
      return
    }

    pending = true
    try {
      const response = await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          username: normalizedUsername,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 409) {
          usernameState = 'unavailable'
          usernameMessage = body.message || 'That username is already taken.'
        }
        throw new Error(
          body.message ||
            (response.status === 429
              ? 'Too many profile updates. Wait a moment and try again.'
              : `Profile update failed (${response.status}).`),
        )
      }

      const refreshed = await getBrowserSession()
      if (refreshed.status !== 'authenticated')
        throw new Error(
          'Your profile saved, but the refreshed session could not be loaded.',
        )
      user = refreshed.session.user
      name = user.name
      username = user.username
      usernameState = 'idle'
      usernameMessage = ''
      profileNotice = 'Your profile was updated.'
    } catch (error) {
      profileError = (error as Error).message
    } finally {
      pending = false
    }
  }

  async function loadRecoverable() {
    message = ''
    try {
      recoverable = (await api('/workspaces/recoverable')) as Workspace[]
    } catch (error) {
      message = (error as Error).message
    }
  }

  async function restoreWorkspace(workspace: Workspace) {
    if (pending) return
    pending = true
    message = ''
    try {
      await api(`/workspaces/${workspace.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version: workspace.version }),
      })
      await Promise.all([
        loadRecoverable(),
        invalidate(workspacesDataDependency),
      ])
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }

  async function checkDeletion() {
    message = ''
    try {
      const result = (await api('/account/deletion-preflight')) as {
        blockingHouseholds: { id: string; name: string }[]
      }
      deletionBlockers = result.blockingHouseholds
    } catch (error) {
      message = (error as Error).message
    }
  }

  async function deleteAccount(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget as HTMLFormElement)
    pending = true
    message = ''
    try {
      await api('/account/delete', {
        method: 'POST',
        body: JSON.stringify({
          password: String(data.get('password') ?? ''),
          confirmation: String(data.get('confirmation') ?? ''),
        }),
      })
      location.href = '/sign-in'
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Profile · Dukat</title></svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
  <header>
    <h1 class="text-3xl font-semibold tracking-tight">Profile</h1>
    <p class="mt-1 text-muted-foreground">
      Manage your public identity, recovery, and account.
    </p>
  </header>

  <Card.Root>
    <Card.Header>
      <Card.Title>Public identity</Card.Title>
      <Card.Description>
        Choose how your identity appears to other Dukat users.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if profileState === 'loading'}
        <p class="flex items-center gap-2" aria-live="polite">
          <Spinner aria-hidden="true" /> Loading profile…
        </p>
      {:else if profileState === 'error'}
        <Alert.Root variant="destructive" role="alert">
          <Alert.Title>Could not load profile</Alert.Title>
          <Alert.Description>{profileError}</Alert.Description>
          <Button class="mt-3" variant="outline" onclick={loadProfile}
            >Try again</Button
          >
        </Alert.Root>
      {:else if user}
        <div class="grid gap-6 md:grid-cols-[8rem_minmax(0,1fr)]">
          <div class="flex flex-col items-center gap-2">
            {#if user.image}
              <img
                src={user.image}
                alt={`${user.name}'s profile`}
                class="size-24 rounded-full border object-cover"
              />
            {:else}
              <div
                class="flex size-24 items-center justify-center rounded-full border bg-muted text-2xl font-semibold"
                role="img"
                aria-label={initials
                  ? `Profile initials: ${initials}`
                  : 'Generic profile image'}
              >
                {#if initials}
                  {initials}
                {:else}
                  <UserIcon class="size-10" aria-hidden="true" />
                {/if}
              </div>
            {/if}
            <span class="text-center text-xs text-muted-foreground"
              >Current profile image</span
            >
          </div>

          <form onsubmit={updateProfile}>
            {#if profileError}
              <Alert.Root variant="destructive" class="mb-4" role="alert">
                <Alert.Title>Could not update profile</Alert.Title>
                <Alert.Description>{profileError}</Alert.Description>
              </Alert.Root>
            {/if}
            {#if profileNotice}
              <Alert.Root class="mb-4" role="status" aria-live="polite">
                <Alert.Title>Profile updated</Alert.Title>
                <Alert.Description>{profileNotice}</Alert.Description>
              </Alert.Root>
            {/if}
            <Field.Group>
              <Field.Field>
                <Field.Label for="profile-name">Name</Field.Label>
                <Input
                  id="profile-name"
                  name="name"
                  autocomplete="name"
                  maxlength={100}
                  bind:value={name}
                  required
                />
              </Field.Field>
              <Field.Field>
                <Field.Label for="profile-username">Username</Field.Label>
                <Input
                  id="profile-username"
                  name="username"
                  autocomplete="username"
                  minlength={3}
                  maxlength={30}
                  pattern={usernamePattern}
                  aria-describedby="profile-username-feedback"
                  aria-invalid={usernameState === 'unavailable'}
                  bind:value={username}
                  oninput={checkUsername}
                  required
                />
                <Field.Description
                  id="profile-username-feedback"
                  aria-live="polite"
                  class={usernameState === 'unavailable'
                    ? 'text-destructive'
                    : usernameState === 'available'
                      ? 'text-green-700 dark:text-green-400'
                      : ''}
                >
                  {usernameMessage ||
                    '3–30 characters. Start with a letter; use letters, numbers, or underscores.'}
                </Field.Description>
              </Field.Field>
              <Field.Field>
                <Field.Label for="profile-email">Email</Field.Label>
                <Input
                  id="profile-email"
                  name="email"
                  type="email"
                  value={user.email}
                  readonly
                />
                <Field.Description>
                  Email cannot be changed here.
                </Field.Description>
              </Field.Field>
              <div>
                <Button type="submit" disabled={pending}>
                  {#if pending}<Spinner aria-hidden="true" />{/if}
                  {pending ? 'Saving…' : 'Save profile'}
                </Button>
              </div>
            </Field.Group>
          </form>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if message}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Profile action failed</Alert.Title>
      <Alert.Description>{message}</Alert.Description>
    </Alert.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <Card.Title>Workspace recovery</Card.Title>
      <Card.Description>
        Restore shared workspaces that are still in their recovery period.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      <div>
        <Button variant="outline" onclick={loadRecoverable}>
          Find deleted workspaces
        </Button>
      </div>
      {#each recoverable as workspace (workspace.id)}
        <div class="flex items-center justify-between gap-3 border-b pb-3">
          <span>{workspace.name}</span>
          <Button
            variant="outline"
            disabled={pending}
            onclick={() => restoreWorkspace(workspace)}>Restore</Button
          >
        </div>
      {/each}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Delete your account</Card.Title>
      <Card.Description>
        Review ownership requirements before permanently deleting your account.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      {#if deletionBlockers === null}
        <div>
          <Button variant="outline" onclick={checkDeletion}>
            Review account deletion
          </Button>
        </div>
      {:else if deletionBlockers.length > 0}
        <Alert.Root variant="destructive">
          <Alert.Title>Transfer ownership first</Alert.Title>
          <Alert.Description>
            You are the sole owner of: {deletionBlockers
              .map(({ name }) => name)
              .join(', ')}.
          </Alert.Description>
        </Alert.Root>
      {:else}
        <form onsubmit={deleteAccount}>
          <Field.Group>
            <Field.Field>
              <Field.Label for="account-password">Current password</Field.Label>
              <Input
                id="account-password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
              />
            </Field.Field>
            <Field.Field orientation="horizontal">
              <Checkbox
                id="delete-account-confirmation"
                name="confirmation"
                value="DELETE"
                required
              />
              <Field.Label for="delete-account-confirmation">
                I understand this action is permanent.
              </Field.Label>
            </Field.Field>
            <Button type="submit" variant="destructive" disabled={pending}>
              Delete my account
            </Button>
          </Field.Group>
        </form>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
