// Daily revenue must be entered day by day: a day can only be saved once every
// earlier day since the lock started has been entered by a person. Rows created
// by the TTB / LINE Pay imports don't count — only manual_entered_at does.
export const SALES_LOCK_START_DATE = '2026-10-01'

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** Every day from the lock start up to (not including) `before` that nobody has entered yet. */
export function missingSalesDates(enteredDates: Iterable<string>, before: string): string[] {
  const entered = new Set(enteredDates)
  const missing: string[] = []
  for (let day = SALES_LOCK_START_DATE; day < before; day = addDays(day, 1)) {
    if (!entered.has(day)) missing.push(day)
  }
  return missing
}

export function thaiShortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}
