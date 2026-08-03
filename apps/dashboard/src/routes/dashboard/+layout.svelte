<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { Alert, Button } from '@dukat/ui'
  import { getBrowserSession } from '$lib/session'

  let { children } = $props()
  let guardState = $state<'loading' | 'authenticated' | 'error'>('loading')
  let message = $state('')

  async function guard() {
    guardState = 'loading'
    const result = await getBrowserSession()
    if (result.status === 'authenticated') guardState = 'authenticated'
    else if (result.status === 'unauthenticated')
      await goto('/sign-in', { replaceState: true })
    else {
      message = result.message
      guardState = 'error'
    }
  }

  onMount(guard)
</script>

{#if guardState === 'loading'}
  <main class="p-4"><p aria-live="polite">Loading your dashboard…</p></main>
{:else if guardState === 'error'}
  <main class="mx-auto max-w-md p-4">
    <Alert.Root variant="destructive">
      <Alert.Title>Dashboard unavailable</Alert.Title>
      <Alert.Description>{message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={guard}>Try again</Button>
    </Alert.Root>
  </main>
{:else}
  {@render children()}
{/if}
