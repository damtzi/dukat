<script lang="ts">
  import WorkspaceShell from '$lib/components/dashboard/workspace-shell.svelte'
  import type { LayoutProps } from './$types'

  let { data, children }: LayoutProps = $props()
</script>

{#key data.workspaceId}
  <WorkspaceShell {data}>
    {@render children()}
  </WorkspaceShell>
{/key}
