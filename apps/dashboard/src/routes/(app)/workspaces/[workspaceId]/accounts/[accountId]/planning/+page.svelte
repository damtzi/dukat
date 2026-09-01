<script lang="ts">
  import { goto, invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { workspaceDataDependency } from '$lib/api'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import PlanningSection from '$lib/components/planning/planning-section.svelte'
  import { api } from '$lib/controllers/workspace-controller.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const { ledger, workspace } = getWorkspaceDashboardContext()
  let account = $derived(ledger.selected())

  function setIncludeTentative(include: boolean) {
    if (!account) return
    void goto(
      resolve(
        include
          ? '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning?includeTentative=true'
          : '/(app)/workspaces/[workspaceId]/accounts/[accountId]/planning',
        { workspaceId: workspace.workspaceId, accountId: account.id },
      ),
      { keepFocus: true, noScroll: true, replaceState: true },
    )
  }
</script>

{#if account}
  {#key `${workspace.workspaceId}:${account.id}`}
    <PlanningSection
      workspaceId={workspace.workspaceId}
      {account}
      {api}
      plans={data.plans}
      forecast={data.forecast}
      includeTentative={data.includeTentative}
      loadError={data.planningError}
      onrefresh={() => invalidate(workspaceDataDependency)}
      onincludeTentative={setIncludeTentative}
    />
  {/key}
{/if}
