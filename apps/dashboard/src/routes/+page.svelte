<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Button, Alert } from '@dukat/ui'
  import { getBrowserSession } from '$lib/session'

  let routeState = $state<'loading' | 'error'>('loading')
  let message = $state('')

  async function routeFromSession() {
    routeState = 'loading'
    const result = await getBrowserSession()
    if (result.status === 'error') {
      message = result.message
      routeState = 'error'
      return
    }
    const destination = result.status === 'authenticated' ? '/home' : '/sign-in'
    await goto(resolve(destination), { replaceState: true })
  }

  onMount(routeFromSession)
</script>

<svelte:head><title>Dukat</title></svelte:head>
<main class="mx-auto flex min-h-screen max-w-md items-center p-4">
  {#if routeState === 'loading'}
    <p aria-live="polite">Loading…</p>
  {:else}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Could not continue</Alert.Title>
      <Alert.Description>{message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={routeFromSession}
        >Try again</Button
      >
    </Alert.Root>
  {/if}
</main>
