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
    const report = parseEdcDailyReport(sample)

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

  it('rejects a header missing a required column, naming which one', () => {
    const headerWithoutAmount = header.split(',').filter(name => name !== 'amount').join(',')
    expect(() => parseEdcDailyReport([headerWithoutAmount, ...rows].join('\n')))
      .toThrow('หัวตารางไฟล์ EDC CSV ไม่มีคอลัมน์: amount')
  })

  it('accepts columns in a different order', () => {
    const columns = header.split(',')
    const reordered = [columns[1], columns[0], ...columns.slice(2)].join(',')
    const reorderedRows = rows.map(row => {
      const values = row.split(',')
      return [values[1], values[0], ...values.slice(2)].join(',')
    })
    const report = parseEdcDailyReport([reordered, ...reorderedRows].join('\n'))
    expect(report.transactionCount).toBe(2)
    expect(report.merchantName).toBe('คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส')
  })

  it('ignores an unused column no matter what it is named (terminal_id, reference_id, or anything else)', () => {
    const asReferenceId = [header.replace('terminal_id', 'reference_id'), ...rows].join('\n')
    expect(() => parseEdcDailyReport(asReferenceId)).not.toThrow()

    const withoutThatColumnAtAll = [
      header.split(',').filter(name => name !== 'terminal_id').join(','),
      ...rows.map(row => row.split(',').filter((_, index) => index !== 2).join(',')),
    ].join('\n')
    expect(() => parseEdcDailyReport(withoutThatColumnAtAll)).not.toThrow()
  })

  it('groups multiple transaction dates while ignoring terminal ID differences', () => {
    // terminal_id varies by card scheme (Visa/Mastercard vs. JCB) on the same physical
    // device, so a differing terminal_id alone is not a rejection reason.
    const otherTerminal = sample.replace(',88122653,EDC,CREDIT_CARD_INTER', ',99999999,EDC,CREDIT_CARD_INTER')
    expect(() => parseEdcDailyReport(otherTerminal)).not.toThrow()

    const otherDate = sample.replace('2026-08-24 21:24:49', '2026-08-23 21:24:49')
    expect(parseEdcDailyReport(otherDate).revenueDays).toEqual([
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
    const report = parseEdcDailyReport(withJcb)
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

    const report = parseEdcDailyReport(mixedServices)
    expect(report.transactions.map(item => item.serviceName)).toEqual([
      'CREDIT_CARD_LOCAL', 'CREDIT_CARD_INTER', 'DEBIT_CARD', 'QR_PROMPTPAY', 'UPI_CARD',
    ])
    expect(report.revenueDays[0]).toMatchObject({
      revenueDate: '2026-08-23', transactionCount: 3, grossAmountSatang: 25_000,
    })
  })

  it('accepts the confirmed legacy spelling for the same merchant ID', () => {
    const legacyName = sample.replaceAll('คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส', 'คิตสุ ยากินิคุ')
    expect(() => parseEdcDailyReport(legacyName)).not.toThrow()
  })

  it('rejects a report for a different store, even with a familiar terminal_id', () => {
    const wrongMerchant = sample.replaceAll('คินสึ ยากินิคุ เซ็นทรัล ขอนแก่น แคมปัส', 'ร้านอื่น')
    expect(() => parseEdcDailyReport(wrongMerchant))
      .toThrow('รายงาน EDC ไม่ใช่ร้าน KINTSU Central Khon Kaen Campus')
  })

  it('allows delayed settlement after the transaction date', () => {
    const delayedSettlement = sample.replaceAll('2026-08-25', '2026-08-26')
    expect(() => parseEdcDailyReport(delayedSettlement)).not.toThrow()
  })

  it('treats a transaction dated exactly on its own settlement date as belonging to the day before', () => {
    // Confirmed real-world case (2026-09-03): every transaction_time in the settlement
    // exactly equaled settlement_date instead of preceding it — LINE Pay's batch/
    // settlement processing moment, not the real point-of-sale time. The store's own
    // POS credit-card total for settlement_date minus one day matched this settlement's
    // total to the baht, confirming the sale actually happened the day before.
    const bothSameDayAsSettlement = sample.replaceAll('2026-08-24', '2026-08-25')
    const report = parseEdcDailyReport(bothSameDayAsSettlement)
    expect(report.revenueDate).toBe('2026-08-24')
    expect(report.revenueDays).toEqual([
      expect.objectContaining({ revenueDate: '2026-08-24', transactionCount: 2 }),
    ])
  })

  it('still rejects a transaction genuinely dated after its own settlement date', () => {
    const afterSettlement = sample.replace('2026-08-24 21:24:49', '2026-08-26 09:11:26')
    expect(() => parseEdcDailyReport(afterSettlement))
      .toThrow('Settlement EDC ต้องอยู่หลังวันขายทุกรายการ')
  })

  it('rejects duplicate transaction IDs and unreconciled net amounts', () => {
    const duplicate = sample.replace('tx-inter', 'tx-local')
    expect(() => parseEdcDailyReport(duplicate))
      .toThrow('Transaction ID EDC ซ้ำ')

    const wrongNet = sample.replace('2448.59', '2448.58')
    expect(() => parseEdcDailyReport(wrongNet))
      .toThrow('ยอดสุทธิ EDC ไม่ตรง')
  })
})
