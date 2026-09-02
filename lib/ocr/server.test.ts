import { describe, expect, it } from 'vitest'
import { expenseBillSchemaVersion } from './server'

describe('expenseBillSchemaVersion', () => {
  it('keeps cache stable across category ordering and invalidates it when categories change', () => {
    const first = expenseBillSchemaVersion(['วัตถุดิบ', 'อุปกรณ์สำนักงาน'], '1')
    expect(first).toContain('expense-date-v2')
    expect(expenseBillSchemaVersion(['อุปกรณ์สำนักงาน', 'วัตถุดิบ'], '1')).toBe(first)
    expect(expenseBillSchemaVersion(['อุปกรณ์สำนักงาน'], '1')).not.toBe(first)
  })
})
