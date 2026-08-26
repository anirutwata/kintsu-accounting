export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const

export const BUDDHIST_ERA_OFFSET = 543

export interface DateParts {
  year: number
  month: number
  day: number
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function parseIsoDate(iso: string): DateParts {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function mergeIsoDateParts(iso: string, change: Partial<DateParts>): string {
  const next = { ...parseIsoDate(iso), ...change }
  return toIsoDate(next.year, next.month, Math.min(next.day, daysInMonth(next.year, next.month)))
}
