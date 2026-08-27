<script lang="ts">
  import { resolve } from '$app/paths'
  import { Alert, Button, Card, Field, Input, Spinner } from '@dukat/ui'

  let error = $state('')
  let notice = $state('')
  let pending = $state(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    error = ''
    notice = ''
    pending = true
    try {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          email: String(data.get('email') ?? '').trim(),
          password: String(data.get('password') ?? ''),
          callbackURL: '/',
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          body.message || `Authentication failed (${response.status}).`,
        )
      notice = 'Check your email to verify your account, then sign in.'
      form.reset()
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Create account · Dukat</title></svelte:head>
<main class="flex min-h-screen w-full items-center justify-center px-4">
  <Card.Root class="mx-auto w-full max-w-sm">
    <Card.Header>
      <Card.Title class="text-2xl">Create your account</Card.Title>
      <Card.Description
        >Create an account to start managing your finances.</Card.Description
      >
    </Card.Header>
    <Card.Content>
      {#if error}<Alert.Root variant="destructive" class="mb-4" role="alert"
          ><Alert.Title>Could not continue</Alert.Title><Alert.Description
            >{error}</Alert.Description
          ></Alert.Root
        >{/if}
      {#if notice}<Alert.Root class="mb-4" role="status" aria-live="polite"
          ><Alert.Title>Account created</Alert.Title><Alert.Description
            >{notice}</Alert.Description
          ></Alert.Root
        >{/if}
      <form onsubmit={submit}>
        <Field.Group>
          <Field.Field>
            <Field.Label for="name">Name</Field.Label><Input
              id="name"
              name="name"
              autocomplete="name"
              placeholder="John Doe"
              required
            />
          </Field.Field>
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
              autocomplete="new-password"
              minlength={8}
              required
            />
            <Field.Description>
              Must be at least 8 characters long.
            </Field.Description>
          </Field.Field>
          <Field.Field>
            <Button type="submit" class="w-full" disabled={pending}
              >{#if pending}<Spinner aria-hidden="true" />{/if}Create account</Button
            >
            <Field.Description class="px-6 text-center">
              Already have an account? <a href={resolve('/sign-in')}>Sign in</a>
            </Field.Description>
          </Field.Field>
        </Field.Group>
      </form>
    </Card.Content>
  </Card.Root>
</main>
