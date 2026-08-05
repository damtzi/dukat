<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { Alert, Button, Card, Input, Label } from '@dukat/ui'
  import { getBrowserSession } from '$lib/session'

  let email = ''
  let password = ''
  let error = ''
  let pending = false

  onMount(async () => {
    const result = await getBrowserSession()
    if (result.status === 'authenticated')
      await goto('/dashboard', { replaceState: true })
  })

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    error = ''
    pending = true
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          body.message || `Authentication failed (${response.status}).`,
        )
      await goto('/dashboard')
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Sign in · Dukat</title></svelte:head>
<main class="mx-auto flex min-h-screen max-w-md items-center p-4">
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title>Sign in to Dukat</Card.Title>
      <Card.Description
        >Enter your email and password to see your finances.</Card.Description
      >
    </Card.Header>
    <Card.Content>
      {#if error}<Alert.Root variant="destructive" class="mb-4"
          ><Alert.Title>Could not sign in</Alert.Title><Alert.Description
            >{error}</Alert.Description
          ></Alert.Root
        >{/if}
      <form class="space-y-4" onsubmit={submit}>
        <div class="space-y-2">
          <Label for="email">Email</Label><Input
            id="email"
            type="email"
            autocomplete="email"
            bind:value={email}
            required
          />
        </div>
        <div class="space-y-2">
          <Label for="password">Password</Label><Input
            id="password"
            type="password"
            autocomplete="current-password"
            minlength={8}
            bind:value={password}
            required
          />
        </div>
        <Button type="submit" class="w-full" disabled={pending}
          >{pending ? 'Please wait…' : 'Sign in'}</Button
        >
      </form>
    </Card.Content>
    <Card.Footer class="justify-center text-sm"
      ><span>New to Dukat?</span><Button
        href="/sign-up"
        variant="link"
        class="px-2">Create an account</Button
      ></Card.Footer
    >
  </Card.Root>
</main>
