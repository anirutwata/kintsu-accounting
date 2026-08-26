import { describe, expect, it } from 'vitest'
import { buildLinePayEdcFailureAlert } from './linePayEdcAlert'

describe('LINE Pay EDC failure alert', () => {
  it('shows both accounting dates and warns the operator to inspect FlowAccount before retrying', () => {
    const alert = buildLinePayEdcFailureAlert('2026-08-24', '2026-08-25', 'มี Cash Sale รอ Void')
    expect(alert).toContain('วันที่ขาย <b>2026-08-24</b>')
    expect(alert).toContain('Settlement <b>2026-08-25</b>')
    expect(alert).toContain('ตรวจ FlowAccount ก่อนลองใหม่')
  })

  it('escapes an API error before placing it in Telegram HTML', () => {
    expect(buildLinePayEdcFailureAlert('2026-08-24', '2026-08-25', 'API <invalid> & failed'))
      .toContain('API &lt;invalid&gt; &amp; failed')
  })
})
