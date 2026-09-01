<script lang="ts">
  import { Card } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/PageHeader.svelte'
</script>

<svelte:head><title>Settings · Dukat</title></svelte:head>

<div class="flex w-full flex-col gap-6">
  <PageHeader
    title="Settings"
    description="Global preferences for your Dukat experience."
  />

  <Card.Root class="w-full max-w-4xl">
    <Card.Header>
      <Card.Title>Preferences</Card.Title>
      <Card.Description>
        Dukat currently uses English text with Polish date and number
        formatting. More preferences will live here.
      </Card.Description>
    </Card.Header>
  </Card.Root>
</div>
