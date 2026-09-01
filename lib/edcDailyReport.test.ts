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
      revenueDays: [{
        revenueDate: '2026-08-24', transactionCount: 2, grossAmountSatang: 945_100,
      }],
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

  it('accepts a report where LINE Pay renamed the terminal_id column to reference_id', () => {
    const renamedHeader = header.replace('terminal_id', 'reference_id')
    const renamed = [renamedHeader, ...rows].join('\n')
    const report = parseEdcDailyReport(renamed, 'EDC_DailyReport_20260825.csv')
    expect(report.transactionCount).toBe(2)
  })

  it('rejects a filename date that differs from settlement_date', () => {
    expect(() => parseEdcDailyReport(sample, 'EDC_DailyReport_20260824.csv'))
      .toThrow('วันที่ชื่อไฟล์ EDC ไม่ตรงกับ Settlement')
  })

  it('groups multiple transaction dates while ignoring terminal ID differences', () => {
    // terminal_id varies by card scheme (Visa/Mastercard vs. JCB) on the same physical
    // device, so a differing terminal_id alone is not a rejection reason.
    const otherTerminal = sample.replace(',88122653,EDC,CREDIT_CARD_INTER', ',99999999,EDC,CREDIT_CARD_INTER')
    expect(() => parseEdcDailyReport(otherTerminal, 'EDC_DailyReport_20260825.csv')).not.toThrow()

    const otherDate = sample.replace('2026-08-24 21:24:49', '2026-08-23 21:24:49')
    expect(parseEdcDailyReport(otherDate, 'EDC_DailyReport_20260825.csv').revenueDays).toEqual([
      expect.objectContaining({ revenueDate: '2026-08-23', transactionCount: 1, grossAmountSatang: 253_400 }),
      expect.objectContaining({ revenueDate: '2026-08-24', transactionCount: 1, grossAmountSatang: 691_700 }),
    ])
  })

  it('accepts JCB transactions alongside Visa/Mastercard ones, under a different terminal_id', () => {
    const withJcb = [
      header,
      ...rows,
      '59IlGmY3YE2dsy1aUflYJI8WDrpyoA,คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส,19912876,EDC,JCB_CARD,994,0.03,29.82,2.09,962.09,2026-08-25,2026-08-24 18:44:44,tx-jcb',
    ].join('\n')
    const report = parseEdcDailyReport(withJcb, 'EDC_DailyReport_20260825.csv')
    expect(report.transactionCount).toBe(3)
    expect(report.grossAmountSatang).toBe(945_100 + 99_400)
  })

  it('accepts debit card and LINE Pay QR PromptPay transactions in the same settlement', () => {
    const mixedServices = [
      header,
      ...rows,
      '59IlGmY3YE2dsy1aUflYJI8WDrpyoA,คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส,19912876,EDC,DEBIT_CARD,100,0.023,2.30,0.16,97.54,2026-08-25,2026-08-23 18:44:44,tx-debit',
      '59IlGmY3YE2dsy1aUflYJI8WDrpyoA,คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส,19912876,EDC,QR_PROMPTPAY,50,0,0,0,50,2026-08-25,2026-08-23 19:44:44,tx-qr',
      '59IlGmY3YE2dsy1aUflYJI8WDrpyoA,คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส,19912876,EDC,UPI_CARD,100,0.023,2.30,0.16,97.54,2026-08-25,2026-08-23 20:44:44,tx-upi',
    ].join('\n')

    const report = parseEdcDailyReport(mixedServices, 'EDC_DailyReport_20260825.csv')
    expect(report.transactions.map(item => item.serviceName)).toEqual([
      'CREDIT_CARD_LOCAL', 'CREDIT_CARD_INTER', 'DEBIT_CARD', 'QR_PROMPTPAY', 'UPI_CARD',
    ])
    expect(report.revenueDays[0]).toMatchObject({
      revenueDate: '2026-08-23', transactionCount: 3, grossAmountSatang: 25_000,
    })
  })

  it('accepts the confirmed legacy spelling for the same merchant ID', () => {
    const legacyName = sample.replaceAll('คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส', 'คิตสุ ยากินิคุ')
    expect(() => parseEdcDailyReport(legacyName, 'EDC_DailyReport_20260825.csv')).not.toThrow()
  })

  it('rejects a report for a different store, even with a familiar terminal_id', () => {
    const wrongMerchant = sample.replaceAll('คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส', 'ร้านอื่น')
    expect(() => parseEdcDailyReport(wrongMerchant, 'EDC_DailyReport_20260825.csv'))
      .toThrow('รายงาน EDC ไม่ใช่ร้าน KINTSU Central Khon Kaen Campus')
  })

  it('allows delayed settlement after the transaction date', () => {
    const delayedSettlement = sample.replaceAll('2026-08-25', '2026-08-26')
    expect(() => parseEdcDailyReport(delayedSettlement, 'EDC_DailyReport_20260826.csv')).not.toThrow()
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
