import { describe, expect, it } from 'vitest'
import { buildLinePayEdcFailureAlert, buildLinePayEdcManualReviewAlert, buildLinePayEdcSuccessAlert } from './linePayEdcAlert'

describe('LINE Pay EDC success alert', () => {
  it('shows both dates, the amount, and both FlowAccount document serials', () => {
    const alert = buildLinePayEdcSuccessAlert(['2026-08-23', '2026-08-24'], '2026-08-25', 945_100, ['CA2026080009', 'CA2026080010'], 'JV2026080020')
    expect(alert).toContain('Sync กับ FlowAccount สำเร็จ')
    expect(alert).toContain('วันที่ขาย <b>2026-08-23, 2026-08-24</b>')
    expect(alert).toContain('Settlement <b>2026-08-25</b>')
    expect(alert).toContain('9,451.00')
    expect(alert).toContain('CA2026080009')
    expect(alert).toContain('CA2026080010')
    expect(alert).toContain('JV2026080020')
  })
})

describe('LINE Pay EDC manual review alert', () => {
  it('names the revenue date and the affected tax invoice requests', () => {
    const alert = buildLinePayEdcManualReviewAlert('2026-08-27', ['req-1', 'req-2'])
    expect(alert).toContain('วันที่ขาย <b>2026-08-27</b>')
    expect(alert).toContain('req-1, req-2')
  })
})

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
