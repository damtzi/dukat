<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { Alert, Button, Spinner } from '@dukat/ui'
  import { getBrowserSession, type SessionUser } from '$lib/session'

  let { children } = $props()
  let guardState = $state<'loading' | 'authenticated' | 'error'>('loading')
  let user = $state<SessionUser | null>(null)
  let message = $state('')

  async function guard() {
    guardState = 'loading'
    const result = await getBrowserSession()
    if (result.status === 'authenticated') {
      user = result.session.user
      guardState = 'authenticated'
    } else if (result.status === 'unauthenticated')
      await goto(resolve('/sign-in'), { replaceState: true })
    else {
      message = result.message
      guardState = 'error'
    }
  }

  async function signOut() {
    await fetch('/api/auth/sign-out', { method: 'POST' })
    await goto(resolve('/sign-in'), { replaceState: true })
  }

  onMount(guard)
</script>

{#if guardState === 'loading'}
  <main class="flex min-h-screen items-center justify-center p-4">
    <Spinner class="size-6 text-muted-foreground" aria-label="Loading Dukat" />
  </main>
{:else if guardState === 'error'}
  <main class="mx-auto max-w-md p-4">
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Dukat unavailable</Alert.Title>
      <Alert.Description>{message}</Alert.Description>
      <Button class="mt-3" variant="outline" onclick={guard}>Try again</Button>
    </Alert.Root>
  </main>
{:else if user}
  <header class="flex h-14 items-center gap-3 border-b px-4">
    <span class="text-sm font-medium">Dukat</span>
    <span class="ml-auto text-sm text-muted-foreground">{user.name}</span>
    <Button variant="outline" size="sm" onclick={signOut}>Sign out</Button>
  </header>
  <main class="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">
    {@render children()}
  </main>
{/if}
