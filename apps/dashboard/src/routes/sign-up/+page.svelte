<script lang="ts">
  import { Alert, Button, Card, Input, Label } from '@dukat/ui'

  let name = ''
  let email = ''
  let password = ''
  let error = ''
  let notice = ''
  let pending = false

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    error = ''
    notice = ''
    pending = true
    try {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: '/',
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          body.message || `Authentication failed (${response.status}).`,
        )
      notice = 'Check your email to verify your account, then sign in.'
      password = ''
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Create account · Dukat</title></svelte:head>
<main class="mx-auto flex min-h-screen max-w-md items-center p-4">
  <Card.Root class="w-full">
    <Card.Header
      ><Card.Title>Create your account</Card.Title><Card.Description
        >Create an account to start managing your finances.</Card.Description
      ></Card.Header
    >
    <Card.Content>
      {#if error}<Alert.Root variant="destructive" class="mb-4"
          ><Alert.Title>Could not continue</Alert.Title><Alert.Description
            >{error}</Alert.Description
          ></Alert.Root
        >{/if}
      {#if notice}<Alert.Root class="mb-4"
          ><Alert.Title>Account created</Alert.Title><Alert.Description
            >{notice}</Alert.Description
          ></Alert.Root
        >{/if}
      <form class="space-y-4" onsubmit={submit}>
        <div class="space-y-2">
          <Label for="name">Name</Label><Input
            id="name"
            autocomplete="name"
            bind:value={name}
            required
          />
        </div>
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
            autocomplete="new-password"
            minlength={8}
            bind:value={password}
            required
          />
        </div>
        <Button type="submit" class="w-full" disabled={pending}
          >{pending ? 'Please wait…' : 'Create account'}</Button
        >
      </form>
    </Card.Content>
    <Card.Footer class="justify-center text-sm"
      ><span>Already have an account?</span><Button
        href="/sign-in"
        variant="link"
        class="px-2">Sign in</Button
      ></Card.Footer
    >
  </Card.Root>
</main>
