<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import { accountSchema } from '@dukat/core/ledger'
  import type { Category } from '@dukat/core/csv-import'
  import { Button, DropdownMenu, toast } from '@dukat/ui'
  import PlusIcon from 'phosphor-svelte/lib/Plus'
  import { z } from 'zod'
  import {
    api,
    apiJson,
    overviewDataDependency,
    workspaceDataDependency,
  } from '$lib/api'
  import TransactionDialog from '$lib/components/ledger/transaction-dialog.svelte'
  import TransferDialog from '$lib/components/ledger/transfer-dialog.svelte'
  import { createLedgerController } from '$lib/controllers/ledger-controller.svelte'
  import type {
    PickerAccount,
    Workspace,
    WorkspaceRouteData,
  } from '$lib/controllers/workspace-controller.svelte'

  let { workspaces }: { workspaces: Workspace[] } = $props()
  let routeData = $state.raw<WorkspaceRouteData>({
    state: 'ready',
    message: '',
    workspaceId: '',
    accounts: [],
    categories: [],
    members: [],
    selectedAccountId: '',
    rateStatus: null,
    convertedBalances: null,
    workspaceForecast: null,
  })
  let pickerAccounts = $state.raw<PickerAccount[]>([])
  let loading = $state(false)
  let activeWorkspace = $derived(
    workspaces.find(({ id }) => id === page.params.workspaceId) ??
      workspaces.find(({ type }) => type === 'personal') ??
      workspaces[0] ??
      null,
  )

  async function loadPickerAccounts() {
    pickerAccounts = (
      await Promise.all(
        workspaces.map(async (workspace) =>
          (
            await apiJson(
              `/workspaces/${workspace.id}/accounts`,
              z.array(accountSchema),
            )
          ).map((account) => ({
            ...account,
            workspaceId: workspace.id,
            workspaceLabel: `${workspace.name} (${workspace.type === 'household' ? 'Household' : 'Personal'})`,
            workspaceType: workspace.type,
          })),
        ),
      )
    ).flat()
  }

  const ledger = createLedgerController({
    getWorkspaceId: () => routeData.workspaceId,
    getPickerAccounts: () => pickerAccounts,
    loadPickerAccounts,
    reloadAccounts: async () => {
      await Promise.all([
        invalidate(workspaceDataDependency),
        invalidate(overviewDataDependency),
      ])
    },
    getRouteData: () => routeData,
  })

  async function open(kind: 'expense' | 'income' | 'transfer') {
    if (!activeWorkspace || loading) return
    loading = true
    try {
      const workspace = activeWorkspace
      const [accounts, categories] = await Promise.all([
        apiJson(`/workspaces/${workspace.id}/accounts`, z.array(accountSchema)),
        api<Category[]>(`/workspaces/${workspace.id}/categories`),
      ])
      if (activeWorkspace?.id !== workspace.id) return
      const activeAccounts = accounts.filter(({ archivedAt }) => !archivedAt)
      if (activeAccounts.length === 0) {
        toast.error(`Add an active account in ${workspace.name} first.`)
        return
      }
      routeData = {
        ...routeData,
        workspaceId: workspace.id,
        accounts,
        categories,
        selectedAccountId: activeAccounts[0].id,
      }
      if (kind === 'transfer') {
        const opened = await ledger.transfer.createQuick()
        if (activeWorkspace?.id !== workspace.id) {
          ledger.transfer.dialog.open = false
          return
        }
        if (!opened && ledger.status.message) toast.error(ledger.status.message)
      } else ledger.transaction.create(undefined, kind, true)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      loading = false
    }
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} size="sm" disabled={!activeWorkspace || loading}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        New
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="min-w-44">
    <DropdownMenu.Label>
      {activeWorkspace?.name ?? 'No workspace'}
    </DropdownMenu.Label>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onSelect={() => void open('expense')}>
      Expense
    </DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => void open('income')}>
      Income
    </DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => void open('transfer')}>
      Transfer
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<TransactionDialog
  bind:open={ledger.transaction.dialog.open}
  bind:form={ledger.transaction.dialog.form}
  editingTransaction={ledger.transaction.dialog.editing}
  editingHouseholdExpense={ledger.transaction.dialog.editingHouseholdExpense}
  creatingHouseholdExpense={ledger.transaction.dialog.creatingHouseholdExpense}
  refundingExpense={ledger.transaction.dialog.refundingExpense}
  quickEntry={ledger.transaction.dialog.quickEntry}
  error={ledger.transaction.dialog.error}
  pending={ledger.status.pending}
  categories={routeData.categories}
  accounts={routeData.accounts}
  recentMerchants={ledger.transaction.dialog.recentMerchants}
  recentCategoryIds={ledger.transaction.dialog.recentCategoryIds}
  onsubmit={ledger.transaction.save}
/>
<TransferDialog
  bind:open={ledger.transfer.dialog.open}
  bind:form={ledger.transfer.dialog.form}
  editingTransfer={ledger.transfer.dialog.editing}
  quickEntry={ledger.transfer.dialog.quickEntry}
  error={ledger.transfer.dialog.error}
  pending={ledger.status.pending}
  accounts={pickerAccounts}
  transferDestinations={ledger.transfer.destinations}
  quote={(input) =>
    api(`/workspaces/${routeData.workspaceId}/rates/quote`, {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<{
      available: boolean
      suggestedAmountMinor: string | null
      rates: Array<{
        currency: string
        rateToPln: string
        source: string
        effectiveDate: string
        tableNumber: string | null
      }>
    }>}
  onsubmit={ledger.transfer.save}
/>
