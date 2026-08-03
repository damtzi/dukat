<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { Button, Alert } from '@dukat/ui'
  import { getBrowserSession } from '$lib/session'

  let state: 'loading' | 'error' = 'loading'
  let message = ''

  async function routeFromSession() {
    state = 'loading'
    const result = await getBrowserSession()
    if (result.status === 'error') {
      message = result.message
      state = 'error'
      return
    }
    await goto(result.status === 'authenticated' ? '/dashboard' : '/sign-in', {
      replaceState: true,
    })
  }

  onMount(routeFromSession)
</script>

<svelte:head><title>Dukat</title></svelte:head>
<main class="mx-auto flex min-h-screen max-w-md items-center p-4">
  {#if state === 'loading'}
    <p aria-live="polite">Loading…</p>
  {:else}
    <Alert.Root variant="destructive">
      <Alert.Title>Could not continue</Alert.Title>
      <Alert.Description>{message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={routeFromSession}
        >Try again</Button
      >
    </Alert.Root>
  {/if}
</main>
