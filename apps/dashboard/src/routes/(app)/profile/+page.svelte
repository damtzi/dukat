<script lang="ts">
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Checkbox, Field, Input } from '@dukat/ui'
  import {
    api,
    type Workspace,
  } from '$lib/controllers/workspace-controller.svelte'

  let message = $state('')
  let pending = $state(false)
  let recoverable = $state.raw<Workspace[]>([])
  let deletionBlockers = $state.raw<{ id: string; name: string }[] | null>(null)

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
      await loadRecoverable()
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

<main
  class="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-4 md:p-8"
>
  <header>
    <Button href={resolve('/home')} variant="link">Back to home</Button>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight">Profile</h1>
    <p class="mt-1 text-muted-foreground">
      Manage account access, recovery, and deletion.
    </p>
  </header>

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
</main>
