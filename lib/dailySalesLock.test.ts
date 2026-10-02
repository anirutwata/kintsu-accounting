import { describe, expect, it } from 'vitest'
import { addDays, missingSalesDates, SALES_LOCK_START_DATE } from './dailySalesLock'

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('missingSalesDates', () => {
  it('never checks days before the lock starts', () => {
    expect(missingSalesDates([], SALES_LOCK_START_DATE)).toEqual([])
    expect(missingSalesDates([], '2026-09-30')).toEqual([])
  })

  it('blocks the next day when yesterday was not entered', () => {
    expect(missingSalesDates([], '2026-10-02')).toEqual(['2026-10-01'])
    expect(missingSalesDates(['2026-10-01'], '2026-10-02')).toEqual([])
  })

  it('reports every gap, oldest first', () => {
    expect(missingSalesDates(['2026-10-02'], '2026-10-05')).toEqual(['2026-10-01', '2026-10-03', '2026-10-04'])
  })
})
