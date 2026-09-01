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
    description?: string
    actions?: Snippet
  } = $props()
</script>

<header class="flex flex-wrap items-start justify-between gap-3">
  <div>
    <h2 {id} class="text-xl font-semibold">{title}</h2>
    {#if description}
      <p class="text-sm text-muted-foreground">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex shrink-0 flex-wrap gap-2">{@render actions()}</div>
  {/if}
</header>
