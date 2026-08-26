<script lang="ts">
  import { Alert } from '@dukat/ui'
  import PlanForm from './PlanForm.svelte'
  import PlanList from './PlanList.svelte'
  import ForecastSection from './ForecastSection.svelte'
  import type {
    Forecast,
    Occurrence,
    Plan,
    PlanningAccount,
    PlanningApi,
    PlanSaveInput,
    Suggestion,
  } from './planning-types'

  let {
    workspaceId,
    account,
    api,
    plans,
    forecast,
    includeTentative,
    loadError,
    onrefresh,
    onincludeTentative,
  }: {
    workspaceId: string
    account: PlanningAccount
    api: PlanningApi
    plans: Plan[]
    forecast: Forecast | null
    includeTentative: boolean
    loadError: string
    onrefresh: () => Promise<void>
    onincludeTentative: (include: boolean) => void
  } = $props()

  let pending = $state(false)
  let error = $state('')
  let editing: Plan | null = $state(null)
  let formGeneration = $state(0)
  let intentKeys: Record<string, string> = $state({})
  let displayedError = $derived(error || loadError)

  const accountPlans = () =>
    plans.filter((plan) => plan.accountId === account.id)
  const intentKey = (name: string) => {
    intentKeys[name] ??= crypto.randomUUID()
    return intentKeys[name]
  }
  const mutation = (planId: string, name: string) => ({
    idempotencyKey: intentKey(name),
    version: plans.find((plan) => plan.id === planId)?.version ?? 0,
  })
  const completed = (name: string) => {
    const remaining = { ...intentKeys }
    delete remaining[name]
    intentKeys = remaining
  }

  async function run(action: () => Promise<unknown>) {
    if (pending) return
    pending = true
    error = ''
    try {
      await action()
      await onrefresh()
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }

  async function save(input: PlanSaveInput) {
    await run(async () => {
      await api(
        `/workspaces/${workspaceId}/plans${editing ? `/${editing.id}` : ''}`,
        { method: editing ? 'PUT' : 'POST', body: JSON.stringify(input) },
      )
      editing = null
      formGeneration++
    })
  }

  async function planAction(
    plan: Plan,
    action: 'stop' | 'cancel',
    stopDate?: string,
  ) {
    const name = `${plan.id}:${action}:${stopDate ?? ''}`
    await run(async () => {
      await api(`/workspaces/${workspaceId}/plans/${plan.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          version: plan.version,
          idempotencyKey: intentKey(name),
          ...(action === 'stop' ? { stopDate } : {}),
        }),
      })
      completed(name)
    })
  }

  async function occurrenceAction(
    item: Occurrence,
    action: 'skip' | 'restore' | 'reschedule',
    date?: string,
  ) {
    if (action === 'reschedule' && !date) {
      error = 'Choose a new date first.'
      return
    }
    const name = `${item.planId}:${item.originalDate}:${action}:${date ?? ''}`
    await run(async () => {
      await api(
        `/workspaces/${workspaceId}/plans/${item.planId}/occurrences/${item.originalDate}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...mutation(item.planId, name),
            ...(action === 'reschedule' ? { date } : {}),
          }),
        },
      )
      completed(name)
    })
  }

  async function restore(plan: Plan, originalDate: string) {
    if (!originalDate) {
      error = 'Enter the original occurrence date to restore.'
      return
    }
    const name = `${plan.id}:${originalDate}:restore`
    await run(async () => {
      await api(
        `/workspaces/${workspaceId}/plans/${plan.id}/occurrences/${originalDate}/restore`,
        {
          method: 'POST',
          body: JSON.stringify(mutation(plan.id, name)),
        },
      )
      completed(name)
    })
  }

  async function suggestions(item: Occurrence) {
    error = ''
    return (await api(
      `/workspaces/${workspaceId}/plans/${item.planId}/occurrences/${item.originalDate}/suggestions`,
    )) as Suggestion[]
  }

  async function match(item: Occurrence, suggestion: Suggestion) {
    const name = `${item.planId}:${item.originalDate}:match:${suggestion.transaction.id}`
    await run(async () => {
      await api(
        `/workspaces/${workspaceId}/plans/${item.planId}/occurrences/${item.originalDate}/match`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...mutation(item.planId, name),
            transactionId: suggestion.transaction.id,
          }),
        },
      )
      completed(name)
    })
  }

  async function unmatch(item: Occurrence) {
    const name = `${item.planId}:${item.originalDate}:unmatch`
    await run(async () => {
      await api(
        `/workspaces/${workspaceId}/plans/${item.planId}/occurrences/${item.originalDate}/unmatch`,
        {
          method: 'POST',
          body: JSON.stringify(mutation(item.planId, name)),
        },
      )
      completed(name)
    })
  }

  function edit(plan: Plan) {
    editing = plan
    formGeneration++
  }
</script>

<section class="mt-6 flex flex-col gap-6" aria-labelledby="planning-title">
  <div>
    <h2 id="planning-title" class="text-2xl font-semibold">Planning</h2>
    <p class="text-sm text-muted-foreground">
      Plan upcoming money for {account.name} in {account.currency}.
    </p>
  </div>
  {#if displayedError}<Alert.Root variant="destructive"
      ><Alert.Title>Planning action failed</Alert.Title><Alert.Description
        >{displayedError}</Alert.Description
      ></Alert.Root
    >{/if}
  {#if account.archivedAt}<p class="text-sm text-muted-foreground">
      This account is archived. Planning changes are disabled.
    </p>{:else}{#key `${account.id}:${formGeneration}`}<PlanForm
        {account}
        {editing}
        {pending}
        onsubmit={save}
        oncancel={() => (editing = null)}
        onerror={(message) => (error = message)}
      />{/key}{/if}
  <PlanList
    plans={accountPlans()}
    currency={account.currency}
    loading={false}
    pending={pending || !!account.archivedAt}
    onedit={edit}
    onaction={planAction}
    onrestore={restore}
  />
  <ForecastSection
    {forecast}
    {plans}
    currency={account.currency}
    loading={false}
    {pending}
    readonly={!!account.archivedAt}
    {includeTentative}
    {onincludeTentative}
    onaction={occurrenceAction}
    onsuggestions={suggestions}
    onmatch={match}
    onunmatch={unmatch}
  />
</section>
