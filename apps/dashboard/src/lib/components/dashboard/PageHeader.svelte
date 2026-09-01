<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    id,
    title,
    description,
    actions,
  }: {
    id?: string
    title: string
    description: string
    actions?: Snippet
  } = $props()
</script>

<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
  <div class="min-w-0">
    <h1 {id} class="text-3xl font-semibold tracking-tight">{title}</h1>
    <p class="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
  </div>
  {#if actions}
    <div class="flex shrink-0 flex-wrap gap-2">{@render actions()}</div>
  {/if}
</header>
