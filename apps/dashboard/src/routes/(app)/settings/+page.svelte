<script lang="ts">
  import { Card } from '@dukat/ui'
</script>

<svelte:head><title>Settings · Dukat</title></svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
  <header>
    <h1 class="text-3xl font-semibold tracking-tight">Settings</h1>
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
</div>
