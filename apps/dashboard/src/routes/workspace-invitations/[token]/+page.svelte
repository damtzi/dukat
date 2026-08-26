<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { Alert, Button, Card } from '@dukat/ui'
  import { getBrowserSession } from '$lib/session'

  let invitationState = $state<'loading' | 'sign-in' | 'error'>('loading')
  let message = $state('')
  onMount(async () => {
    const session = await getBrowserSession()
    if (session.status === 'unauthenticated') {
      invitationState = 'sign-in'
      return
    }
    if (session.status === 'error') {
      invitationState = 'error'
      message = session.message
      return
    }
    try {
      const response = await fetch(
        `/api/workspace-invitations/${encodeURIComponent(page.params.token ?? '')}/accept`,
        { method: 'POST', headers: { 'content-type': 'application/json' } },
      )
      const body = (await response.json().catch(() => ({}))) as {
        message?: string
        workspaceId?: string
      }
      if (!response.ok)
        throw new Error(
          body.message ||
            'This invitation is expired, revoked, or does not match your signed-in email.',
        )
      if (body.workspaceId)
        await goto(
          resolve('/(app)/workspaces/[workspaceId]', {
            workspaceId: body.workspaceId,
          }),
        )
      else await goto(resolve('/home'))
    } catch (cause) {
      invitationState = 'error'
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
      {#if invitationState === 'loading'}<p aria-live="polite">
          Accepting invitation…
        </p>
      {:else if invitationState === 'sign-in'}<Alert.Root
          ><Alert.Title>Sign in required</Alert.Title><Alert.Description
            >Sign in with the email address that received this invitation, then
            open the invitation link again.</Alert.Description
          ></Alert.Root
        ><Button class="mt-3" href={resolve('/sign-in')}>Sign in</Button>
      {:else}<Alert.Root variant="destructive" role="alert"
          ><Alert.Title>Could not accept invitation</Alert.Title
          ><Alert.Description>{message}</Alert.Description></Alert.Root
        ><Button class="mt-3" href={resolve('/home')} variant="outline"
          >Go home</Button
        >{/if}
    </Card.Content></Card.Root
  >
</main>
