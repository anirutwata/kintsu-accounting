import { describe, expect, it } from 'vitest'
import { buildSalesMessage } from './telegram'

describe('buildSalesMessage', () => {
  it('shows old → new on overwrite and full breakdown', () => {
    const msg = buildSalesMessage({
      date: '2026-11-19', byName: 'jiraporn',
      previous: { dine_in_revenue_satang: 3505700, cash_satang: 500000, dine_in_bills: 40, total_net_satang: 3505700 },
      current: { dine_in_revenue_satang: 1713500, cash_satang: 296900, promptpay_satang: 409400, dine_in_bills: 27, total_net_satang: 1713500 },
    })
    expect(msg).toContain('บันทึกทับ')
    expect(msg).toMatch(/Foodstory: ฿35,057\.00 → <b>฿17,135\.00<\/b>/)
    expect(msg).toContain('บิล: 40 → <b>27</b>')
    expect(msg).toContain('พร้อมเพย์: ฿0.00 → <b>฿4,094.00</b>')
    expect(msg).toContain('jiraporn')
  })
  it('first save lists values without arrows', () => {
    const msg = buildSalesMessage({ date: '2026-11-20', byName: 'x', current: { dine_in_revenue_satang: 100, cash_satang: 100, total_net_satang: 100 } })
    expect(msg).toContain('💰 บันทึกรายรับ')
    expect(msg).not.toContain('→')
    expect(msg).not.toContain('Grab')
  })
})
