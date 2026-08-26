import { describe, expect, it } from 'vitest'
import { mergeIsoDateParts } from './thaiDate'

describe('Thai date selector', () => {
  it('keeps the ISO date contract when changing day, month, or year', () => {
    expect(mergeIsoDateParts('2026-08-26', { day: 15 })).toBe('2026-08-15')
    expect(mergeIsoDateParts('2026-08-26', { month: 7 })).toBe('2026-07-26')
    expect(mergeIsoDateParts('2026-08-26', { year: 2025 })).toBe('2025-08-26')
  })

  it('clamps the day to the end of the selected month, including leap years', () => {
    expect(mergeIsoDateParts('2026-01-31', { month: 2 })).toBe('2026-02-28')
    expect(mergeIsoDateParts('2024-01-31', { month: 2 })).toBe('2024-02-29')
    expect(mergeIsoDateParts('2024-02-29', { year: 2025 })).toBe('2025-02-28')
  })
})
