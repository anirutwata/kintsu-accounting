import { describe, expect, it } from 'vitest'
import { buildTtbPromptPayFailureAlert, buildTtbPromptPaySuccessAlert } from './ttbPromptPayAlert'

describe('TTB PromptPay success alert', () => {
  it('shows the report date, amount, and FlowAccount document serial', () => {
    const alert = buildTtbPromptPaySuccessAlert('2026-08-25', 2_642_700, 'JV2026080030')
    expect(alert).toContain('Sync กับ FlowAccount สำเร็จ')
    expect(alert).toContain('รายงานวันที่ <b>2026-08-25</b>')
    expect(alert).toContain('26,427.00')
    expect(alert).toContain('JV2026080030')
  })
})

describe('TTB PromptPay failure alert', () => {
  it('identifies the accounting date without claiming that no remote document can exist', () => {
    expect(buildTtbPromptPayFailureAlert('2026-08-25', 'ไม่พบรายงาน TTB Smart Shop')).toContain(
      'รายงานวันที่ <b>2026-08-25</b>',
    )
    expect(buildTtbPromptPayFailureAlert('2026-08-25', 'ไม่พบรายงาน TTB Smart Shop')).toContain(
      'ไม่สามารถยืนยันการ Sync กับ FlowAccount',
    )
    expect(buildTtbPromptPayFailureAlert('2026-08-25', 'มี JV รอ Void')).toContain('อาจมี JV รอ Void')
  })

  it('escapes an API error before placing it in an HTML Telegram message', () => {
    expect(buildTtbPromptPayFailureAlert('2026-08-25', 'API <invalid> & failed')).toContain(
      'API &lt;invalid&gt; &amp; failed',
    )
  })
})
