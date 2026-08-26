import { describe, expect, it } from 'vitest'
import { parseEdcDailyReport } from './edcDailyReport'

const header = 'merchant_id,merchant_name,terminal_id,service_group_name,service_name,amount,fee_rate,fee_amount,vat_amount,net_amount,settlement_date,transaction_time,transaction_id'
const rows = [
  '59IlGmY3YE2dsy1aUflYJI8WDrpyoA,คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส,88122653,EDC,CREDIT_CARD_LOCAL,6917,0.023,159.09,11.14,6746.77,2026-08-25,2026-08-24 13:07:51,tx-local',
  '59IlGmY3YE2dsy1aUflYJI8WDrpyoA,คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส,88122653,EDC,CREDIT_CARD_INTER,2534,0.0315,79.82,5.59,2448.59,2026-08-25,2026-08-24 21:24:49,tx-inter',
]
const sample = [header, ...rows].join('\n')

describe('LINE Pay EDC daily report', () => {
  it('uses transaction time as the revenue date and reconciles the settlement totals', () => {
    const report = parseEdcDailyReport(sample, 'EDC_DailyReport_20260825.csv')

    expect(report).toMatchObject({
      revenueDate: '2026-08-24',
      settlementDate: '2026-08-25',
      merchantName: 'คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส',
      terminalId: '88122653',
      transactionCount: 2,
      grossAmountSatang: 945_100,
      feeAmountSatang: 23_891,
      feeVatSatang: 1_673,
      netAmountSatang: 919_536,
    })
    expect(report.transactions.map(item => item.transactionId)).toEqual(['tx-local', 'tx-inter'])
  })

  it('rejects a filename date that differs from settlement_date', () => {
    expect(() => parseEdcDailyReport(sample, 'EDC_DailyReport_20260824.csv'))
      .toThrow('วันที่ชื่อไฟล์ EDC ไม่ตรงกับ Settlement')
  })

  it('rejects transactions from an unrecognized terminal or transaction date', () => {
    const otherTerminal = sample.replace(',88122653,EDC,CREDIT_CARD_INTER', ',99999999,EDC,CREDIT_CARD_INTER')
    expect(() => parseEdcDailyReport(otherTerminal, 'EDC_DailyReport_20260825.csv'))
      .toThrow('Terminal ID EDC ไม่ถูกต้อง: 99999999')

    const otherDate = sample.replace('2026-08-24 21:24:49', '2026-08-23 21:24:49')
    expect(() => parseEdcDailyReport(otherDate, 'EDC_DailyReport_20260825.csv'))
      .toThrow('รายงาน EDC มีธุรกรรมมากกว่าหนึ่งวัน')
  })

  it('accepts the store\'s second (JCB) terminal ID alongside the primary one', () => {
    const withJcb = [
      header,
      ...rows,
      '59IlGmY3YE2dsy1aUflYJI8WDrpyoA,คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส,19912876,EDC,JCB_CARD,994,0.03,29.82,2.09,962.09,2026-08-25,2026-08-24 18:44:44,tx-jcb',
    ].join('\n')
    const report = parseEdcDailyReport(withJcb, 'EDC_DailyReport_20260825.csv')
    expect(report.terminalId).toBe('88122653') // the stable primary device ID, not whichever row came first
    expect(report.transactionCount).toBe(3)
    expect(report.grossAmountSatang).toBe(945_100 + 99_400)
  })

  it('requires settlement on the calendar day after the transaction date', () => {
    const delayedSettlement = sample.replaceAll('2026-08-25', '2026-08-26')
    expect(() => parseEdcDailyReport(delayedSettlement, 'EDC_DailyReport_20260826.csv'))
      .toThrow('Settlement EDC ต้องเป็นวันถัดจากวันขาย')
  })

  it('rejects duplicate transaction IDs and unreconciled net amounts', () => {
    const duplicate = sample.replace('tx-inter', 'tx-local')
    expect(() => parseEdcDailyReport(duplicate, 'EDC_DailyReport_20260825.csv'))
      .toThrow('Transaction ID EDC ซ้ำ')

    const wrongNet = sample.replace('2448.59', '2448.58')
    expect(() => parseEdcDailyReport(wrongNet, 'EDC_DailyReport_20260825.csv'))
      .toThrow('ยอดสุทธิ EDC ไม่ตรง')
  })
})
