import { describe, expect, it } from 'vitest'
import {
  assertTtbFilenameMatchesReportDate,
  parseTtbSmartShopRows,
  reportDateFromTtbFilename,
  type ReportCell,
} from './ttbPromptPayReport'

function reportRows(summaryAmount = 19708): ReportCell[][] {
  return [
    ['SALES REPORT'], ['Merchant ID: ', '862842540343158'], ['Biller ID: ', 'x'],
    [], [], [],
    ['Transaction ID', 'Payment Date', 'Payment Time', 'Payment Amount', 'Transaction Status', 'Payment Channel', 'Payer Bank', 'Ref 1', 'Ref 2', 'Ref 3', 'Owner', 'Username', 'Payer Name', 'Bank Ref'],
    ['merchant', '24/08/2026', '20:55:02', 951, 'Success', 'QR STATIC', 'SCB', '', '', '', '', '', 'Customer A', 'REF-A'],
    ['merchant', '24/08/2026', '20:37:43', 18757, 'Success', 'QR STATIC', 'KBank', '', '', '', '', '', 'Customer B', 'REF-B'],
    ['merchant', '24/08/2026', '20:00:00', 1, 'Cancelled', 'QR STATIC', 'TTB', '', '', '', '', '', 'Customer C', 'REF-C'],
    ['หมายเหตุ: - สรุปรายการสำหรับวันที่ 24/08/2026 ณ เวลา 23:00 น. (Cut - off time เวลา 23:00 น.)'],
    ['จำนวนรายการสำเร็จ', '2'], ['ยอดเงินรายการสำเร็จ', summaryAmount],
    ['จำนวนรายการคืนเงินสำเร็จ', '0'], ['ยอดเงินรายการคืนเงินสำเร็จ', 0],
  ]
}

describe('TTB Smart Shop report', () => {
  it('uses only successful transactions and verifies the bank summary', () => {
    const report = parseTtbSmartShopRows(reportRows())
    expect(report).toMatchObject({ reportDate: '2026-08-24', successfulCount: 2, successfulAmountSatang: 1_970_800 })
    expect(report.transactions.map(item => item.bankReference)).toEqual(['REF-A', 'REF-B'])
  })

  it('rejects a report whose transaction total disagrees with its summary', () => {
    expect(() => parseTtbSmartShopRows(reportRows(19707))).toThrow('ยอด TTB ไม่ตรง')
  })

  it('reads the accounting date from the TTB attachment filename', () => {
    expect(reportDateFromTtbFilename('Report_Kintsu-24-08-2026.xlsx')).toBe('2026-08-24')
  })

  it('rejects an attachment filename that does not identify a report date', () => {
    expect(() => reportDateFromTtbFilename('Report_Kintsu.xlsx')).toThrow('ชื่อไฟล์รายงาน TTB ไม่ถูกต้อง')
  })

  it('rejects an attachment whose filename date disagrees with the workbook', () => {
    expect(() => assertTtbFilenameMatchesReportDate('Report_Kintsu-23-08-2026.xlsx', '2026-08-24'))
      .toThrow('วันที่ชื่อไฟล์ TTB ไม่ตรงกับวันที่รับเงิน')
  })

  it('accepts the undated Report_Kintsu.xlsx TTB sends for a manually-requested resend', () => {
    expect(() => assertTtbFilenameMatchesReportDate('Report_Kintsu.xlsx', '2026-08-27')).not.toThrow()
  })

  it('rejects a report whose summary date disagrees with its transactions', () => {
    const rows = reportRows()
    rows[10] = ['หมายเหตุ: - สรุปรายการสำหรับวันที่ 23/08/2026 ณ เวลา 23:00 น.']
    expect(() => parseTtbSmartShopRows(rows)).toThrow('วันที่สรุปในรายงาน TTB ไม่ตรงกับวันที่รับเงิน')
  })
})
