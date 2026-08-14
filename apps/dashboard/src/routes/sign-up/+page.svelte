<script lang="ts">
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
<main class="mx-auto flex min-h-screen max-w-md items-center p-4">
  <Card.Root class="w-full">
    <Card.Header
      ><Card.Title>Create your account</Card.Title><Card.Description
        >Create an account to start managing your finances.</Card.Description
      ></Card.Header
    >
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
              required
            />
          </Field.Field>
          <Field.Field>
            <Field.Label for="email">Email</Field.Label><Input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
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
          </Field.Field>
          <Button type="submit" class="w-full" disabled={pending}
            >{#if pending}<Spinner aria-hidden="true" />{/if}Create account</Button
          >
        </Field.Group>
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
