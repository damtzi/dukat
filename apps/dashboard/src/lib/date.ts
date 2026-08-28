const CALENDAR_TIME_ZONE = 'Europe/Warsaw'

export function todayInWarsaw(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function calendarMonthRange(date = todayInWarsaw()) {
  const [year, month] = date.split('-').map(Number)
  const end = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${end}`,
  }
}

export function shiftCalendarMonth(date: string, amount: number) {
  const [year, month] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, month! - 1 + amount, 1))
  return calendarMonthRange(
    `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`,
  )
}

export type CashFlowPreset = 'month' | '3m' | '6m' | '12m' | 'ytd' | 'custom'

export type DateRange = { startDate: string; endDate: string }

function shiftDateByMonths(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year!, month! - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day!, lastDay)).padStart(2, '0')}`
}

export function cashFlowRange(
  preset: Exclude<CashFlowPreset, 'custom'>,
  today = todayInWarsaw(),
): DateRange {
  if (preset === 'ytd')
    return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today }
  const months = preset === 'month' ? 1 : Number.parseInt(preset)
  return {
    startDate: `${shiftDateByMonths(today, -(months - 1)).slice(0, 7)}-01`,
    endDate: today,
  }
}

export function equivalentCashFlowRange(
  selected: DateRange,
  preset: CashFlowPreset,
): DateRange {
  if (preset !== 'custom') {
    if (preset === 'ytd')
      return {
        startDate: `${Number(selected.startDate.slice(0, 4)) - 1}-01-01`,
        endDate: shiftDateByMonths(selected.endDate, -12),
      }
    const months = preset === 'month' ? 1 : Number.parseInt(preset)
    return {
      startDate: shiftDateByMonths(selected.startDate, -months),
      endDate: shiftDateByMonths(selected.endDate, -months),
    }
  }
  const start = new Date(`${selected.startDate}T12:00:00Z`)
  const end = new Date(`${selected.endDate}T12:00:00Z`)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const previousEnd = new Date(start.getTime() - 86_400_000)
  const previousStart = new Date(
    previousEnd.getTime() - (days - 1) * 86_400_000,
  )
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10),
  }
}

export function formatDateRange(value: DateRange) {
  const format = new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${format.format(new Date(`${value.startDate}T12:00:00Z`))}–${format.format(new Date(`${value.endDate}T12:00:00Z`))}`
}
