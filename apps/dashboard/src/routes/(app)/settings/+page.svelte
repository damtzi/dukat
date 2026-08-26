<script lang="ts">
  import { resolve } from '$app/paths'
  import { Button, Card } from '@dukat/ui'
</script>

<svelte:head><title>Settings · Dukat</title></svelte:head>

<main
  class="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-4 md:p-8"
>
  <header>
    <Button href={resolve('/home')} variant="link">Back to home</Button>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight">Settings</h1>
    <p class="mt-1 text-muted-foreground">
      Global preferences for your Dukat experience.
    </p>
  </header>

  <Card.Root>
    <Card.Header>
      <Card.Title>Preferences</Card.Title>
      <Card.Description>
        Dukat currently uses English text with Polish date and number
        formatting. More preferences will live here.
      </Card.Description>
    </Card.Header>
  </Card.Root>
</main>
