export type PlanningAccount = {
  id: string
  name: string
  currency: string
  archivedAt?: string | null
}

export type Plan = {
  id: string
  accountId: string
  kind: 'income' | 'expense'
  amountMinor: string
  date: string
  effectiveFrom: string
  status: 'expected' | 'tentative'
  description?: string | null
  categoryId?: string | null
  recurrence?: {
    frequency: 'weekly' | 'monthly' | 'yearly'
    interval: number
    endDate?: string
  }
  version: number
  cancelled: boolean
  cutoffDate?: string | null
}

export type Occurrence = Pick<
  Plan,
  'accountId' | 'kind' | 'amountMinor' | 'status'
> & {
  planId: string
  originalDate: string
  date: string
}

export type Forecast = {
  id: string
  currentBalanceMinor: string
  startingBalanceMinor: string
  endingBalanceMinor: string
  occurrences: Occurrence[]
  matchedOccurrences: MatchedOccurrence[]
}

export type MatchedOccurrence = {
  occurrence: Occurrence
  transaction: {
    id: string
    date: string
    amountMinor: string
    description?: string | null
  }
}

export type Suggestion = {
  transaction: {
    id: string
    amountMinor: string | bigint
    date: string
    description?: string | null
  }
  equalAmount: boolean
  dateDistanceDays: number
}

export type PlanSaveInput = {
  accountId?: string
  kind?: Plan['kind']
  amountMinor: string
  date?: string
  status: Plan['status']
  description: string | null
  version?: number
  effectiveFrom?: string
  idempotencyKey: string
  recurrence?: Plan['recurrence']
}

export type PlanningApi = (
  path: string,
  options?: RequestInit,
) => Promise<unknown>
