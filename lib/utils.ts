import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getThaiDate(date?: Date | string) {
  const d = date ? new Date(date) : new Date()
  return d.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function getTodayBKK(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) // YYYY-MM-DD
}

export function getMonthKey(date?: string): string {
  const d = date ? new Date(date) : new Date()
  const y = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 4)
  const m = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(5, 7)
  return `${y}-${m}`
}

export function formatThaiMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1, 1)
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

export function getDaysInMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split('-').map(Number)
  const days: string[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getMonth() === month - 1) {
    days.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }))
    d.setDate(d.getDate() + 1)
  }
  return days
}
