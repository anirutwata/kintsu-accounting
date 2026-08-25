import { describe, expect, it } from 'vitest'
import { parseTtbSmartShopRows, type ReportCell } from './ttbPromptPayReport'

function reportRows(summaryAmount = 19708): ReportCell[][] {
  return [
    ['SALES REPORT'], ['Merchant ID: ', '862842540343158'], ['Biller ID: ', 'x'],
    [], [], [],
    ['Transaction ID', 'Payment Date', 'Payment Time', 'Payment Amount', 'Transaction Status', 'Payment Channel', 'Payer Bank', 'Ref 1', 'Ref 2', 'Ref 3', 'Owner', 'Username', 'Payer Name', 'Bank Ref'],
    ['merchant', '24/08/2026', '20:55:02', 951, 'Success', 'QR STATIC', 'SCB', '', '', '', '', '', 'Customer A', 'REF-A'],
    ['merchant', '24/08/2026', '20:37:43', 18757, 'Success', 'QR STATIC', 'KBank', '', '', '', '', '', 'Customer B', 'REF-B'],
    ['merchant', '24/08/2026', '20:00:00', 1, 'Cancelled', 'QR STATIC', 'TTB', '', '', '', '', '', 'Customer C', 'REF-C'],
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
})
