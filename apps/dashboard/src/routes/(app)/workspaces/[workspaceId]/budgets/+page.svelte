<script lang="ts">
  import type { BudgetReport } from '@dukat/core/budgets'
  import {
    Alert,
    Button,
    Card,
    Checkbox,
    Empty,
    Field,
    Input,
    Select,
  } from '@dukat/ui'
  import PageHeader from '$lib/components/dashboard/page-header.svelte'
  import { getWorkspaceDashboardContext } from '$lib/components/dashboard/WorkspaceDashboardContext'
  import { api } from '$lib/controllers/workspace-controller.svelte'
  import { todayInWarsaw } from '$lib/date'
  import { formatMoney, minorToDecimal, parseAmount } from '$lib/money'

  const { ledger, workspace } = getWorkspaceDashboardContext()
  let month = $state(todayInWarsaw().slice(0, 7))
  let includeTentative = $state(false)
  let budgets = $state.raw<BudgetReport[]>([])
  let categoryId = $state('')
  let amount = $state('')
  let error = $state('')
  let pending = $state(false)
  let requestGeneration = 0
  let currency = $derived(workspace.activeWorkspace?.reportingCurrency ?? 'PLN')
  let availableCategories = $derived(
    ledger.categories.filter(
      (category) =>
        !category.archivedAt &&
        !budgets.some((budget) => budget.categoryId === category.id),
    ),
  )
  let selectedCategoryName = $derived(
    availableCategories.find((category) => category.id === categoryId)?.name ??
      'Select category',
  )

  async function load(
    selectedMonth = month,
    tentative = includeTentative,
    generation = ++requestGeneration,
  ) {
    try {
      const result = (await api(
        `/workspaces/${workspace.workspaceId}/budgets?month=${selectedMonth}&includeTentative=${tentative}`,
      )) as BudgetReport[]
      if (generation === requestGeneration) {
        budgets = result
        error = ''
      }
    } catch (cause) {
      if (generation === requestGeneration) error = (cause as Error).message
    }
  }

  $effect(() => {
    const selectedMonth = month
    const tentative = includeTentative
    const generation = ++requestGeneration
    void load(selectedMonth, tentative, generation)
  })

  async function create(event: SubmitEvent) {
    event.preventDefault()
    pending = true
    error = ''
    try {
      await api(`/workspaces/${workspace.workspaceId}/budgets`, {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          month,
          amountMinor: parseAmount(amount, currency),
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      categoryId = ''
      amount = ''
      await load()
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }

  async function edit(budget: BudgetReport) {
    const value = prompt(
      `Monthly limit (${budget.reportingCurrency})`,
      minorToDecimal(budget.amountMinor, budget.reportingCurrency),
    )
    if (value === null) return
    await mutate(`/budgets/${budget.id}`, 'PUT', {
      amountMinor: parseAmount(value, budget.reportingCurrency),
      version: budget.version,
      idempotencyKey: crypto.randomUUID(),
    })
  }

  async function remove(budget: BudgetReport) {
    if (
      !confirm(`Remove the ${budget.categoryName} budget for ${budget.month}?`)
    )
      return
    await mutate(`/budgets/${budget.id}`, 'DELETE', {
      version: budget.version,
      idempotencyKey: crypto.randomUUID(),
    })
  }

  async function mutate(path: string, method: 'PUT' | 'DELETE', body: unknown) {
    pending = true
    error = ''
    try {
      await api(`/workspaces/${workspace.workspaceId}${path}`, {
        method,
        body: JSON.stringify(body),
      })
      await load()
    } catch (cause) {
      error = (cause as Error).message
    } finally {
      pending = false
    }
  }
</script>

<svelte:head><title>Budgets · Dukat</title></svelte:head>

<section class="flex flex-col gap-6" aria-labelledby="budgets-title">
  <PageHeader
    id="budgets-title"
    title="Budgets"
    description="Set category limits for one month. Unused amounts do not roll forward."
  />

  <Card.Root>
    <Card.Header>
      <Card.Title>Month and forecast</Card.Title>
      <Card.Description
        >Expected plans count by default. Include tentative plans for a possible
        outcome.</Card.Description
      >
    </Card.Header>
    <Card.Content>
      <Field.FieldGroup class="grid sm:grid-cols-2">
        <Field.Field>
          <Field.FieldLabel for="budget-month">Month</Field.FieldLabel>
          <Input id="budget-month" type="month" bind:value={month} />
        </Field.Field>
        <Field.Field orientation="horizontal">
          <Checkbox id="include-tentative" bind:checked={includeTentative} />
          <Field.FieldLabel for="include-tentative"
            >Include tentative plans</Field.FieldLabel
          >
        </Field.Field>
      </Field.FieldGroup>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title>Add category budget</Card.Title>
      <Card.Description
        >Limits use the workspace reporting currency, {currency}.</Card.Description
      >
    </Card.Header>
    <Card.Content>
      <form onsubmit={create}>
        <Field.FieldGroup class="grid items-end sm:grid-cols-[1fr_1fr_auto]">
          <Field.Field>
            <Field.FieldLabel for="budget-category">Category</Field.FieldLabel>
            <Select.Root type="single" bind:value={categoryId}>
              <Select.Trigger id="budget-category" class="w-full"
                >{selectedCategoryName}</Select.Trigger
              >
              <Select.Content>
                <Select.Group>
                  {#each availableCategories as category (category.id)}
                    <Select.Item value={category.id} label={category.name}
                      >{category.name}</Select.Item
                    >
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </Field.Field>
          <Field.Field>
            <Field.FieldLabel for="budget-amount"
              >Monthly limit ({currency})</Field.FieldLabel
            >
            <Input
              id="budget-amount"
              inputmode="decimal"
              bind:value={amount}
              required
            />
          </Field.Field>
          <Button type="submit" disabled={pending || !categoryId}
            >Add budget</Button
          >
        </Field.FieldGroup>
      </form>
    </Card.Content>
  </Card.Root>

  {#if error}
    <Alert.Root variant="destructive"
      ><Alert.Description>{error}</Alert.Description></Alert.Root
    >
  {/if}

  {#if budgets.length === 0}
    <Empty.Root>
      <Empty.Header>
        <Empty.Title>No budgets for {month}</Empty.Title>
        <Empty.Description
          >Add a category budget to track completed and planned spending.</Empty.Description
        >
      </Empty.Header>
    </Empty.Root>
  {:else}
    <div class="grid gap-4 lg:grid-cols-2">
      {#each budgets as budget (budget.id)}
        <Card.Root>
          <Card.Header>
            <Card.Title>{budget.categoryName}</Card.Title>
            <Card.Description
              >Limit {formatMoney(
                budget.amountMinor,
                budget.reportingCurrency,
              )}</Card.Description
            >
          </Card.Header>
          <Card.Content class="grid grid-cols-2 gap-4 text-sm">
            {#if budget.missingRate}
              <Alert.Root class="col-span-2" variant="destructive">
                <Alert.Description
                  >Spending totals need a missing exchange rate.</Alert.Description
                >
              </Alert.Root>
            {:else}
              <div>
                <span class="text-muted-foreground">Completed</span>
                <p class="font-semibold">
                  {formatMoney(budget.completedMinor, budget.reportingCurrency)}
                </p>
              </div>
              <div>
                <span class="text-muted-foreground">Expected plans</span>
                <p class="font-semibold">
                  {formatMoney(budget.expectedMinor, budget.reportingCurrency)}
                </p>
              </div>
              <div>
                <span class="text-muted-foreground">Remaining</span>
                <p class="font-semibold">
                  {formatMoney(budget.remainingMinor, budget.reportingCurrency)}
                </p>
              </div>
              <div>
                <span class="text-muted-foreground">Forecast overspend</span>
                <p class="font-semibold">
                  {formatMoney(
                    budget.forecastOverspendMinor,
                    budget.reportingCurrency,
                  )}
                </p>
              </div>
            {/if}
          </Card.Content>
          <Card.Footer class="flex gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onclick={() => edit(budget)}>Edit</Button
            >
            <Button
              variant="destructive"
              disabled={pending}
              onclick={() => remove(budget)}>Remove</Button
            >
          </Card.Footer>
        </Card.Root>
      {/each}
    </div>
  {/if}
</section>
