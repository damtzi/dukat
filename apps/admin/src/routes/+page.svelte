<script lang="ts">
  import {
    Alert,
    Badge,
    Button,
    Card,
    Field,
    Input,
    Spinner,
    Table,
  } from '@dukat/ui'
  import { onMount } from 'svelte'

  type OperationalUser = {
    id: string
    name: string
    username: string
    email: string
    emailVerified: boolean
    isAdmin: boolean
    disabledAt: string | null
    deletionRequestedAt: string | null
    createdAt: string
  }

  type UserAction = 'disable' | 'restore-access' | 'restore-account'

  type OperationalJob = {
    name: string
    scheduledFor: string
    status: 'running' | 'succeeded' | 'failed'
    attempts: number
    startedAt: string
    finishedAt: string | null
    errorCode: string | null
  }

  let users = $state.raw<OperationalUser[]>([])
  let jobs = $state.raw<OperationalJob[]>([])
  let registrationOpen = $state(true)
  let viewState = $state<
    'loading' | 'ready' | 'signed-out' | 'forbidden' | 'error'
  >('loading')
  let pending = $state('')
  let message = $state('')

  onMount(load)

  async function request(path: string, options?: RequestInit) {
    const response = await fetch(`/api${path}`, options)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(
        body.message || `Request failed (${response.status}).`,
      )
      Object.assign(error, { status: response.status })
      throw error
    }
    return body
  }

  async function load() {
    viewState = 'loading'
    message = ''
    try {
      const result = (await request('/admin/state')) as {
        users: OperationalUser[]
        jobs: OperationalJob[]
        registrationOpen: boolean
      }
      users = result.users
      jobs = result.jobs
      registrationOpen = result.registrationOpen
      viewState = 'ready'
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      viewState =
        status === 401 ? 'signed-out' : status === 403 ? 'forbidden' : 'error'
      message = (error as Error).message
    }
  }

  async function signIn(event: SubmitEvent) {
    event.preventDefault()
    const data = new FormData(event.currentTarget as HTMLFormElement)
    pending = 'sign-in'
    message = ''
    try {
      await request('/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
        }),
      })
      await load()
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = ''
    }
  }

  async function setRegistration(open: boolean) {
    pending = 'registration'
    message = ''
    try {
      await request('/admin/registration', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ registrationOpen: open }),
      })
      registrationOpen = open
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = ''
    }
  }

  async function userAction(user: OperationalUser, action: UserAction) {
    pending = user.id
    message = ''
    try {
      await request(`/admin/users/${user.id}/${action}`, { method: 'POST' })
      await load()
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = ''
    }
  }
</script>

<svelte:head><title>Service administration · Dukat</title></svelte:head>

<main class="min-h-screen bg-background px-6 py-12 text-foreground">
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <header>
      <h1 class="text-3xl font-bold tracking-tight">Service administration</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Identity and access status only. Financial records are not available
        here.
      </p>
    </header>

    {#if message}
      <Alert.Root variant="destructive" role="alert">
        <Alert.Title>Action failed</Alert.Title><Alert.Description
          >{message}</Alert.Description
        >
      </Alert.Root>
    {/if}

    {#if viewState === 'loading'}
      <p class="flex items-center gap-2">
        <Spinner aria-hidden="true" /> Loading…
      </p>
    {:else if viewState === 'signed-out'}
      <Card.Root class="max-w-sm">
        <Card.Header>
          <Card.Title>Administrator sign in</Card.Title>
          <Card.Description
            >Use an account with administrator access.</Card.Description
          >
        </Card.Header>
        <Card.Content>
          <form onsubmit={signIn}>
            <Field.Group>
              <Field.Field
                ><Field.Label for="email">Email</Field.Label><Input
                  id="email"
                  name="email"
                  type="email"
                  required
                /></Field.Field
              >
              <Field.Field
                ><Field.Label for="password">Password</Field.Label><Input
                  id="password"
                  name="password"
                  type="password"
                  required
                /></Field.Field
              >
              <Button type="submit" disabled={pending === 'sign-in'}
                >Sign in</Button
              >
            </Field.Group>
          </form>
        </Card.Content>
      </Card.Root>
    {:else if viewState === 'forbidden'}
      <Alert.Root variant="destructive"
        ><Alert.Title>Administrator access required</Alert.Title></Alert.Root
      >
    {:else if viewState === 'error'}
      <Button variant="outline" onclick={load}>Try again</Button>
    {:else}
      <Card.Root>
        <Card.Header>
          <Card.Title>Public registration</Card.Title>
          <Card.Description
            >New account registration is {registrationOpen
              ? 'open'
              : 'closed'}.</Card.Description
          >
        </Card.Header>
        <Card.Content>
          <Button
            variant={registrationOpen ? 'destructive' : 'default'}
            disabled={pending === 'registration'}
            onclick={() => setRegistration(!registrationOpen)}
            >{registrationOpen
              ? 'Close registration'
              : 'Reopen registration'}</Button
          >
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Scheduled jobs</Card.Title>
          <Card.Description>
            Backup and maintenance status only. Errors contain no financial or
            personal data.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if jobs.length === 0}
            <p class="text-sm text-muted-foreground">
              No scheduled job runs recorded.
            </p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Job</Table.Head>
                  <Table.Head>Status</Table.Head>
                  <Table.Head>Scheduled</Table.Head>
                  <Table.Head class="text-right">Attempts</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each jobs as job (`${job.name}:${job.scheduledFor}`)}
                  <Table.Row>
                    <Table.Cell class="font-medium">{job.name}</Table.Cell>
                    <Table.Cell>
                      <Badge
                        variant={job.status === 'failed'
                          ? 'destructive'
                          : job.status === 'succeeded'
                            ? 'secondary'
                            : 'outline'}>{job.status}</Badge
                      >
                      {#if job.errorCode}
                        <span class="ml-2 text-xs text-muted-foreground"
                          >{job.errorCode}</span
                        >
                      {/if}
                    </Table.Cell>
                    <Table.Cell>
                      {new Date(job.startedAt).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell class="text-right">{job.attempts}</Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Users</Card.Title>
          <Card.Description
            >Operational identity, verification, and access status.</Card.Description
          >
        </Card.Header>
        <Card.Content>
          <div class="grid gap-4 md:hidden">
            {#each users as user (user.id)}
              <section class="grid gap-3 border-b pb-4 last:border-b-0">
                <div>
                  <strong>{user.name}</strong>
                  <p class="break-words text-sm text-muted-foreground">
                    @{user.username} · {user.email}
                  </p>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-2">
                    {#if user.isAdmin}<Badge>Administrator</Badge>
                    {:else if user.deletionRequestedAt}<Badge
                        variant="destructive">Deletion pending</Badge
                      >
                    {:else if user.disabledAt}<Badge variant="destructive"
                        >Disabled</Badge
                      >
                    {:else}<Badge variant="secondary">Active</Badge>{/if}
                    <span class="text-xs text-muted-foreground">
                      Created {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {#if !user.isAdmin && user.deletionRequestedAt}
                    <Button
                      variant="outline"
                      disabled={pending === user.id}
                      onclick={() => userAction(user, 'restore-account')}
                      >Restore account</Button
                    >
                  {:else if !user.isAdmin}
                    <Button
                      variant="outline"
                      disabled={pending === user.id}
                      onclick={() =>
                        userAction(
                          user,
                          user.disabledAt ? 'restore-access' : 'disable',
                        )}
                      >{user.disabledAt ? 'Restore access' : 'Disable'}</Button
                    >
                  {/if}
                </div>
              </section>
            {/each}
          </div>
          <Table.Root class="hidden md:table">
            <Table.Header
              ><Table.Row
                ><Table.Head>User</Table.Head><Table.Head>Status</Table.Head
                ><Table.Head>Created</Table.Head><Table.Head class="text-right"
                  >Action</Table.Head
                ></Table.Row
              ></Table.Header
            >
            <Table.Body>
              {#each users as user (user.id)}
                <Table.Row>
                  <Table.Cell
                    ><strong>{user.name}</strong><br /><span
                      class="text-muted-foreground"
                      >@{user.username} · {user.email}</span
                    ></Table.Cell
                  >
                  <Table.Cell>
                    {#if user.isAdmin}<Badge>Administrator</Badge>
                    {:else if user.deletionRequestedAt}<Badge
                        variant="destructive">Deletion pending</Badge
                      >
                    {:else if user.disabledAt}<Badge variant="destructive"
                        >Disabled</Badge
                      >
                    {:else}<Badge variant="secondary">Active</Badge>{/if}
                  </Table.Cell>
                  <Table.Cell
                    >{new Date(user.createdAt).toLocaleDateString()}</Table.Cell
                  >
                  <Table.Cell class="text-right">
                    {#if !user.isAdmin && user.deletionRequestedAt}
                      <Button
                        variant="outline"
                        disabled={pending === user.id}
                        onclick={() => userAction(user, 'restore-account')}
                        >Restore account</Button
                      >
                    {:else if !user.isAdmin}
                      <Button
                        variant="outline"
                        disabled={pending === user.id}
                        onclick={() =>
                          userAction(
                            user,
                            user.disabledAt ? 'restore-access' : 'disable',
                          )}
                        >{user.disabledAt
                          ? 'Restore access'
                          : 'Disable'}</Button
                      >
                    {/if}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
</main>
