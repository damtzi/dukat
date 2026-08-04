<script lang="ts">
  /* global fetch */
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { Alert, Button, Card } from '@dukat/ui'
  import { getBrowserSession } from '$lib/session'

  let state: 'loading' | 'sign-in' | 'error' = 'loading'
  let message = ''
  onMount(async () => {
    const session = await getBrowserSession()
    if (session.status === 'unauthenticated') {
      state = 'sign-in'
      return
    }
    if (session.status === 'error') {
      state = 'error'
      message = session.message
      return
    }
    try {
      const response = await fetch(
        `/api/workspace-invitations/${encodeURIComponent(page.params.token ?? '')}/accept`,
        { method: 'POST', headers: { 'content-type': 'application/json' } },
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          body.message ||
            'This invitation is expired, revoked, or does not match your signed-in email.',
        )
      await goto('/dashboard')
    } catch (cause) {
      state = 'error'
      message = (cause as Error).message
    }
  })
</script>

<svelte:head><title>Accept household invitation · Dukat</title></svelte:head>
<main class="mx-auto flex min-h-screen max-w-md items-center p-4">
  <Card.Root class="w-full"
    ><Card.Header
      ><Card.Title>Household invitation</Card.Title><Card.Description
        >Accept an invitation to collaborate on household finances.</Card.Description
      ></Card.Header
    ><Card.Content>
      {#if state === 'loading'}<p aria-live="polite">Accepting invitation…</p>
      {:else if state === 'sign-in'}<Alert.Root
          ><Alert.Title>Sign in required</Alert.Title><Alert.Description
            >Sign in with the email address that received this invitation, then
            open the invitation link again.</Alert.Description
          ></Alert.Root
        ><Button class="mt-3" href="/sign-in">Sign in</Button>
      {:else}<Alert.Root variant="destructive"
          ><Alert.Title>Could not accept invitation</Alert.Title
          ><Alert.Description>{message}</Alert.Description></Alert.Root
        ><Button class="mt-3" href="/dashboard" variant="outline"
          >Go to dashboard</Button
        >{/if}
    </Card.Content></Card.Root
  >
</main>
