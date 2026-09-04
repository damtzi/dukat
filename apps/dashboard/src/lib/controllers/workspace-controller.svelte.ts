import type { Account } from '@dukat/core/ledger'
import type { Category } from '@dukat/core/csv-import'
import { api } from '$lib/api'

export { api } from '$lib/api'

export type Workspace = {
  id: string
  name: string
  type: 'personal' | 'household'
  reportingCurrency: string | null
  version: number
  role: 'owner' | 'member' | null
}

export type HouseholdMember = {
  userId: string
  name: string
  username: string
  image: string | null
  role: 'owner' | 'member'
  joinedAt: string
}

export type PickerAccount = Account & {
  workspaceId: string
  workspaceLabel: string
  workspaceType: Workspace['type']
}

type RateProvenance = {
  currency: string
  rateToPln: string
  source: 'identity' | 'NBP' | 'manual'
  effectiveDate: string
  tableNumber: string | null
  reason: string | null
}

export type RateStatus = {
  available: boolean
  stale: boolean
  latest: { effectiveDate: string } | null
}

export type ConvertedBalances = {
  reportingCurrency: string
  totalMinor: string | null
  missingRate: boolean
  accounts: Array<
    Account & {
      convertedBalanceMinor: string | null
      rates: RateProvenance[]
    }
  >
  rates: RateProvenance[]
}

export type WorkspaceForecastOccurrence = {
  planId: string
  accountId: string
  kind: 'income' | 'expense'
  amountMinor: string
  status: 'expected' | 'tentative'
  originalDate: string
  date: string
  sourceCurrency: string
  sourceAmountMinor: string
}

export type WorkspaceAccountForecast = {
  id: string
  currency: string
  currentBalanceMinor: string
  startingBalanceMinor: string
  endingBalanceMinor: string
}

export type WorkspaceForecast = {
  estimate: true
  reportingCurrency: string | null
  missingRate: boolean
  startingBalanceMinor: string | null
  endingBalanceMinor: string | null
  occurrences: WorkspaceForecastOccurrence[]
  points: Array<WorkspaceForecastOccurrence & { projectedBalanceMinor: string }>
  accounts: WorkspaceAccountForecast[]
}

export type WorkspaceRouteData = {
  state: 'ready' | 'error'
  message: string
  workspaceId: string
  accounts: Account[]
  categories: Category[]
  members: HouseholdMember[]
  selectedAccountId: string
  rateStatus: RateStatus | null
  convertedBalances: ConvertedBalances | null
  workspaceForecast: WorkspaceForecast | null
}

type WorkspaceCallbacks = {
  getRouteData: () => WorkspaceRouteData
  getWorkspaces: () => Workspace[]
  refreshRouteData: () => Promise<void>
}

export class WorkspaceController {
  pickerAccounts = $state.raw<PickerAccount[]>([])
  refreshVersion = $state(0)

  constructor(private callbacks: WorkspaceCallbacks) {}

  get state() {
    return this.callbacks.getRouteData().state
  }

  get message() {
    return this.callbacks.getRouteData().message
  }

  get workspaces() {
    return this.callbacks.getWorkspaces()
  }

  get workspaceId() {
    return this.callbacks.getRouteData().workspaceId
  }

  get activeWorkspace() {
    return this.workspaces.find(({ id }) => id === this.workspaceId) ?? null
  }

  get accounts() {
    return this.callbacks.getRouteData().accounts
  }

  get categories() {
    return this.callbacks.getRouteData().categories
  }

  get selectedAccountId() {
    return this.callbacks.getRouteData().selectedAccountId
  }

  get rateStatus() {
    return this.callbacks.getRouteData().rateStatus
  }

  get convertedBalances() {
    return this.callbacks.getRouteData().convertedBalances
  }

  get workspaceForecast() {
    return this.callbacks.getRouteData().workspaceForecast
  }

  async refresh() {
    await this.callbacks.refreshRouteData()
    this.refreshVersion++
  }

  async loadPickerAccounts() {
    // Transfers can cross workspace boundaries, so the dialog needs every
    // account the user can access, not only accounts in the current workspace.
    this.pickerAccounts = (
      await Promise.all(
        this.workspaces.map(async (workspace) =>
          (
            (await api(`/workspaces/${workspace.id}/accounts`)) as Account[]
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
}
