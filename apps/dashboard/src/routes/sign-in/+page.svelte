<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Field, Input, Spinner } from '@dukat/ui'
  import { getBrowserSession } from '$lib/session'

  let error = $state('')
  let pending = $state(false)

  onMount(async () => {
    const result = await getBrowserSession()
    if (result.status === 'authenticated')
      await goto(resolve('/home'), { replaceState: true })
  })

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget as HTMLFormElement)
    error = ''
    pending = true
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(data.get('email') ?? '').trim(),
          password: String(data.get('password') ?? ''),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          body.message || `Authentication failed (${response.status}).`,
        )
      await goto(resolve('/home'))
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Sign in · Dukat</title></svelte:head>
<main class="flex min-h-screen w-full items-center justify-center px-4">
  <Card.Root class="mx-auto w-full max-w-sm">
    <Card.Header>
      <Card.Title class="text-2xl">Sign in to Dukat</Card.Title>
      <Card.Description
        >Enter your email and password to see your finances.</Card.Description
      >
    </Card.Header>
    <Card.Content>
      {#if error}<Alert.Root variant="destructive" class="mb-4" role="alert"
          ><Alert.Title>Could not sign in</Alert.Title><Alert.Description
            >{error}</Alert.Description
          ></Alert.Root
        >{/if}
      <form onsubmit={submit}>
        <Field.Group>
          <Field.Field>
            <Field.Label for="email">Email</Field.Label><Input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              placeholder="m@example.com"
              required
            />
          </Field.Field>
          <Field.Field>
            <Field.Label for="password">Password</Field.Label><Input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              minlength={8}
              required
            />
          </Field.Field>
          <Field.Field>
            <Button type="submit" class="w-full" disabled={pending}
              >{#if pending}<Spinner aria-hidden="true" />{/if}Sign in</Button
            >
            <Field.Description class="text-center">
              New to Dukat? <a href={resolve('/sign-up')}>Create an account</a>
            </Field.Description>
          </Field.Field>
        </Field.Group>
      </form>
    </Card.Content>
  </Card.Root>
</main>
