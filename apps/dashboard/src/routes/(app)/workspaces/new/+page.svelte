<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Field, Input, Spinner } from '@dukat/ui'
  import {
    api,
    type Workspace,
  } from '$lib/controllers/workspace-controller.svelte'

  let pending = $state(false)
  let message = $state('')

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget as HTMLFormElement)
    pending = true
    message = ''
    try {
      const workspace = (await api('/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          reportingCurrency: String(
            data.get('reportingCurrency') ?? '',
          ).toUpperCase(),
        }),
      })) as Workspace
      await goto(
        resolve('/(app)/workspaces/[workspaceId]/manage', {
          workspaceId: workspace.id,
        }),
      )
    } catch (error) {
      message = (error as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>New shared workspace · Dukat</title></svelte:head>

<main
  class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-4 md:p-8"
>
  <header>
    <Button href={resolve('/home')} variant="link">Back to home</Button>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight">
      New shared workspace
    </h1>
    <p class="mt-1 text-muted-foreground">
      Create a financial space that you can share with household members.
    </p>
  </header>

  <Card.Root>
    <Card.Header>
      <Card.Title>Workspace details</Card.Title>
      <Card.Description>
        You can invite members after creating the workspace.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if message}
        <Alert.Root variant="destructive" class="mb-4" role="alert">
          <Alert.Title>Could not create workspace</Alert.Title>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Root>
      {/if}
      <form onsubmit={submit}>
        <Field.Group>
          <Field.Field>
            <Field.Label for="workspace-name">Name</Field.Label>
            <Input id="workspace-name" name="name" required />
          </Field.Field>
          <Field.Field>
            <Field.Label for="workspace-currency">
              Reporting currency
            </Field.Label>
            <Input
              id="workspace-currency"
              name="reportingCurrency"
              value="USD"
              minlength={3}
              maxlength={3}
              pattern={'[A-Za-z]{3}'}
              required
            />
          </Field.Field>
          <Button type="submit" disabled={pending}>
            {#if pending}<Spinner
                aria-hidden="true"
                data-icon="inline-start"
              />{/if}
            Create workspace
          </Button>
        </Field.Group>
      </form>
    </Card.Content>
  </Card.Root>
</main>
