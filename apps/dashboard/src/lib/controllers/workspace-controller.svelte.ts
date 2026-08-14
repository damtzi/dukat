import type { Account } from '@dukat/core/ledger'
import type { Category } from '@dukat/core/csv-import'

export type Workspace = {
  id: string
  name: string
  type: 'personal' | 'household'
  reportingCurrency: string | null
  version: number
  role: 'owner' | 'member' | null
}

export type PickerAccount = Account & {
  workspaceId: string
  workspaceLabel: string
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
  rates: RateProvenance[]
}

export type WorkspaceForecast = {
  estimate: true
  reportingCurrency: string | null
  missingRate: boolean
  startingBalanceMinor: string | null
  endingBalanceMinor: string | null
  occurrences: unknown[]
}

type WorkspaceCallbacks = {
  // Workspace loading decides what to show; the ledger controller owns the
  // account data. Callbacks keep that boundary explicit without a third store.
  getPending: () => boolean
  setPending: (pending: boolean) => void
  setMessage: (message: string) => void
  invalidateLedgerRequests: () => void
  resetWorkspaceData: () => void
  applyAccounts: (accounts: Account[], categories: Category[]) => void
  chooseAccount: (accounts: Account[]) => string
  loadLedger: (workspaceId: string, accountId: string) => Promise<void>
  incrementInsightsVersion: () => void
}

export async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      body.message ||
        (response.status === 409
          ? 'This item changed elsewhere. Refresh and try again.'
          : `Request failed (${response.status}).`),
    )
  }
  return response.status === 204 ? null : response.json()
}

export class WorkspaceController {
  state = $state<'loading' | 'ready' | 'error'>('loading')
  workspaces = $state.raw<Workspace[]>([])
  workspaceId = $state('')
  rateStatus = $state.raw<RateStatus | null>(null)
  convertedBalances = $state.raw<ConvertedBalances | null>(null)
  workspaceForecast = $state.raw<WorkspaceForecast | null>(null)
  pickerAccounts = $state.raw<PickerAccount[]>([])
  recoverable = $state.raw<Workspace[]>([])
  deletionBlockers = $state.raw<{ id: string; name: string }[] | null>(null)

  // A request can finish after the user has switched twice. Generations let us
  // discard that valid but obsolete response without needing request aborts.
  private workspaceLoadGeneration = 0
  private accountLoadGeneration = 0
  private accountsWorkspaceId = ''

  constructor(private callbacks: WorkspaceCallbacks) {}

  async load(preferredId = this.workspaceId) {
    const generation = ++this.workspaceLoadGeneration
    this.state = 'loading'
    this.callbacks.setMessage('')
    try {
      const response = await fetch('/api/workspaces')
      if (!response.ok) throw new Error('Could not load your workspaces.')
      const loadedWorkspaces = (await response.json()) as Workspace[]
      if (generation !== this.workspaceLoadGeneration) return
      const targetWorkspaceId = loadedWorkspaces.some(
        ({ id }) => id === preferredId,
      )
        ? preferredId
        : (loadedWorkspaces[0]?.id ?? '')
      this.workspaces = loadedWorkspaces
      this.workspaceId = targetWorkspaceId
      if (targetWorkspaceId) await this.loadAccounts(targetWorkspaceId)
      if (
        generation !== this.workspaceLoadGeneration ||
        this.workspaceId !== targetWorkspaceId
      )
        return
      this.state = 'ready'
    } catch (error) {
      if (generation !== this.workspaceLoadGeneration) return
      this.callbacks.setMessage((error as Error).message)
      this.state = 'error'
    }
  }

  async loadAccounts(targetWorkspaceId = this.workspaceId) {
    const generation = ++this.accountLoadGeneration
    this.callbacks.invalidateLedgerRequests()
    if (
      targetWorkspaceId !== this.accountsWorkspaceId &&
      this.workspaceId === targetWorkspaceId
    ) {
      // Do not leave account data from one workspace under another workspace's
      // heading while the replacement request is in flight.
      this.callbacks.resetWorkspaceData()
      this.convertedBalances = null
      this.workspaceForecast = null
    }
    const [loadedAccounts, loadedCategories] = await Promise.all([
      api(`/workspaces/${targetWorkspaceId}/accounts`) as Promise<Account[]>,
      api(`/workspaces/${targetWorkspaceId}/categories`) as Promise<Category[]>,
    ])
    if (
      generation !== this.accountLoadGeneration ||
      this.workspaceId !== targetWorkspaceId
    )
      return
    this.callbacks.applyAccounts(loadedAccounts, loadedCategories)
    this.accountsWorkspaceId = targetWorkspaceId

    // Reporting data is supplementary. Account and ledger data remain useful
    // when a rate or forecast endpoint is temporarily unavailable.
    void Promise.all([
      api('/rates/status') as Promise<RateStatus>,
      api(
        `/workspaces/${targetWorkspaceId}/balances/converted`,
      ) as Promise<ConvertedBalances>,
    ])
      .then(([rateStatus, convertedBalances]) => {
        if (
          generation === this.accountLoadGeneration &&
          this.workspaceId === targetWorkspaceId
        ) {
          this.rateStatus = rateStatus
          this.convertedBalances = convertedBalances
        }
      })
      .catch(() => undefined)
    void (
      api(
        `/workspaces/${targetWorkspaceId}/forecast`,
      ) as Promise<WorkspaceForecast>
    )
      .then((forecast) => {
        if (
          generation === this.accountLoadGeneration &&
          this.workspaceId === targetWorkspaceId
        )
          this.workspaceForecast = forecast
      })
      .catch(() => undefined)
    const targetAccountId = this.callbacks.chooseAccount(loadedAccounts)
    await this.callbacks.loadLedger(targetWorkspaceId, targetAccountId)
    if (
      generation !== this.accountLoadGeneration ||
      this.workspaceId !== targetWorkspaceId
    )
      return
    this.callbacks.incrementInsightsVersion()
  }

  async chooseWorkspace(targetWorkspaceId: string) {
    this.workspaceLoadGeneration++
    this.callbacks.setMessage('')

    // Keep the picker mounted during this request. This permits another quick
    // selection and is required for stale-response protection to be useful.
    try {
      await this.loadAccounts(targetWorkspaceId)
      if (this.workspaceId === targetWorkspaceId) this.state = 'ready'
    } catch (error) {
      if (this.workspaceId !== targetWorkspaceId) return
      this.callbacks.setMessage((error as Error).message)
      this.state = 'error'
    }
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
          })),
        ),
      )
    ).flat()
  }

  async createHousehold(event: SubmitEvent) {
    event.preventDefault()

    // Workspace creation has no idempotency key. Blocking a second submit is
    // the only client-side protection against duplicate households.
    if (this.callbacks.getPending()) return
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    this.callbacks.setMessage('')
    this.callbacks.setPending(true)
    try {
      const created = (await api('/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          reportingCurrency: String(
            data.get('reportingCurrency') ?? '',
          ).toUpperCase(),
        }),
      })) as Workspace
      form.reset()
      this.workspaces = [...this.workspaces, created]
      this.workspaceId = created.id
      this.workspaceLoadGeneration++
      await this.loadAccounts(created.id)
    } catch (error) {
      this.callbacks.setMessage((error as Error).message)
    } finally {
      this.callbacks.setPending(false)
    }
  }

  async loadRecoverable() {
    try {
      this.recoverable = await api('/workspaces/recoverable')
    } catch (error) {
      this.callbacks.setMessage((error as Error).message)
    }
  }

  async restoreWorkspace(workspace: Workspace) {
    try {
      await api(`/workspaces/${workspace.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version: workspace.version }),
      })
      await this.load(workspace.id)
      await this.loadRecoverable()
    } catch (error) {
      this.callbacks.setMessage((error as Error).message)
    }
  }

  async checkDeletion() {
    try {
      this.deletionBlockers = (
        await api('/account/deletion-preflight')
      ).blockingHouseholds
    } catch (error) {
      this.callbacks.setMessage((error as Error).message)
    }
  }

  async deleteAccount(event: SubmitEvent) {
    event.preventDefault()
    const data = new FormData(event.currentTarget as HTMLFormElement)
    try {
      await api('/account/delete', {
        method: 'POST',
        body: JSON.stringify({
          password: String(data.get('password') ?? ''),
          confirmation: String(data.get('confirmation') ?? ''),
        }),
      })
      location.href = '/sign-in'
    } catch (error) {
      this.callbacks.setMessage((error as Error).message)
    }
  }
}
