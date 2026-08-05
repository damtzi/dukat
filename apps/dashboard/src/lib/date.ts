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
