import { describe, expect, it } from 'vitest'
import { netRevenueAmountSatang } from './netRevenueAmount'

describe('netRevenueAmountSatang', () => {
  it('subtracts full tax invoices reserved before a cash or TTB source JV exists', () => {
    expect(netRevenueAmountSatang(500_000, 78_900)).toBe(421_100)
    expect(netRevenueAmountSatang(78_900, 78_900)).toBe(0)
  })

  it('rejects an allocation above the authoritative revenue', () => {
    expect(() => netRevenueAmountSatang(50_000, 50_001)).toThrow('เกินยอดรายได้ authoritative')
  })
})
