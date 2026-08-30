<script lang="ts">
  import { resolve } from '$app/paths'
  import {
    normalizeUsername,
    usernameValidationMessage,
  } from '@dukat/core/identity'
  import { Alert, Button, Card, Field, Input, Spinner } from '@dukat/ui'
  import { onDestroy } from 'svelte'

  let error = $state('')
  let notice = $state('')
  let pending = $state(false)
  let usernameMessage = $state('')
  let usernameState = $state<'idle' | 'checking' | 'available' | 'unavailable'>(
    'idle',
  )
  let availabilityTimer: ReturnType<typeof setTimeout> | undefined
  let availabilityRequest = 0
  const usernamePattern = '[a-z][a-z0-9_]{2,29}'

  onDestroy(() => clearTimeout(availabilityTimer))

  function checkUsername(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const username = normalizeUsername(input.value)
    input.value = username
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
          'Availability could not be checked. You can still submit.'
      }
    }, 350)
  }

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
          username: normalizeUsername(String(data.get('username') ?? '')),
          email: String(data.get('email') ?? '').trim(),
          password: String(data.get('password') ?? ''),
          callbackURL: '/',
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (body.code === 'USERNAME_UNAVAILABLE') {
          usernameState = 'unavailable'
          usernameMessage = body.message
        }
        throw new Error(
          body.message || `Authentication failed (${response.status}).`,
        )
      }
      notice = 'Check your email to verify your account, then sign in.'
      form.reset()
      usernameState = 'idle'
      usernameMessage = ''
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
              maxlength={100}
              placeholder="John Doe"
              required
            />
          </Field.Field>
          <Field.Field>
            <Field.Label for="username">Username</Field.Label><Input
              id="username"
              name="username"
              autocomplete="username"
              minlength={3}
              maxlength={30}
              pattern={usernamePattern}
              placeholder="john_doe"
              aria-describedby="username-feedback"
              aria-invalid={usernameState === 'unavailable'}
              oninput={checkUsername}
              required
            />
            <Field.Description
              id="username-feedback"
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
