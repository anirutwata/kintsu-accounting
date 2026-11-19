import { describe, expect, it } from 'vitest'
import { parseFoodstoryReports } from './foodstoryReport'
import type { ReportCell } from './ttbPromptPayReport'

const BRANCH = 'Kintsu Yakiniku - Central Khonkaen Campus'

function paymentRows(): ReportCell[][] {
  const title = 'รายงานสรุปยอดขายแยกตามประเภทการชำระเงิน'
  return [
    Array(17).fill(title),
    ['ประเภทการชำระเงิน', 'วิธีบันทึกรายการชำระ', 'รหัสชำระเงินแบบกำหนดเอง', 'ยอดก่อนลด', 'ส่วนลด ส่วนลดสินค้า + ส่วนลดบิล', 'ยอดรวม ยอดก่อนลด - ส่วนลดสินค้า', 'ค่าบริการ', 'ยอดก่อนภาษี ยอดรวม + ค่าบริการ', 'ภาษี', 'ยอดขายสินค้าไม่มีภาษี', 'มูลค่า Voucher มูลค่า Voucher มีโอกาสที่จะมากกว่ายอดรวมทั้งบิล', 'ส่วนลด Voucher', 'ยอดปัดเศษ', 'รวมสุทธิ (ยอดก่อนภาษี + ภาษี +  ยอดปัดเศษ) -  ยอดขายสินค้าไม่มีภาษี', 'ทิป', 'คืนเงิน', 'สาขา'],
    ['Bank Transfer', 'บันทึกเอง', null, 7807, 0, 7807, 0, 7807, 546.49, 0, 0, 0, -5.49, 8348, 0, 0, BRANCH],
    ['Cash', 'บันทึกเอง', null, 2534, 8, 2526, 0, 2526, 176.82, 0, 0, 0, -2.82, 2700, 0, 0, BRANCH],
    ['JCB', 'EDC', null, 1188, 0, 1188, 0, 1188, 83.16, 0, 0, 0, -0.16, 1271, 0, 0, BRANCH],
    ['Master Card', 'EDC', null, 1883, 0, 1883, 0, 1883, 131.81, 0, 0, 0, -0.81, 2014, 0, 0, BRANCH],
    ['VISA', 'EDC', null, 4504, 0, 4504, 0, 4504, 315.28, 0, 0, 0, -2.28, 4817, 0, 0, BRANCH],
    ['Total', null, null, 17916, 8, 17908, 0, 17908, 1253.56, 0, 0, 0, -11.56, 19150, 0, 0],
  ]
}

function dailyRows(date = '18/11/2026', net = 19150): ReportCell[][] {
  const title = 'รายงานสรุปยอดขายแยกตามวัน'
  return [
    Array(17).fill(title),
    ['วันที่', 'ยอดก่อนลด', 'ส่วนลดสินค้า', 'ส่วนลดบิล', 'ยอดรวม ยอดก่อนลด - ส่วนลดสินค้า', 'ค่าบริการ', 'ยอดก่อนภาษี ยอดรวม + ค่าบริการ', 'ภาษี', 'มูลค่า Voucher มูลค่า Voucher มีโอกาสที่จะมากกว่ายอดรวมทั้งบิล', 'ส่วนลด Voucher', 'ยอดปัดเศษ', 'ค่าจัดส่ง', 'รวมสุทธิ (ยอดก่อนภาษี + ภาษี +  ยอดปัดเศษ) -  ยอดขายสินค้าไม่มีภาษี', 'ทิป', 'คืนเงิน', 'จำนวนบิล', 'สาขา'],
    [date, 17916, 0, 8, 17908, 0, 17908, 1253.56, 0, 0, -11.56, 0, net, 0, 0, 21, BRANCH],
    ['Total', 17916, 0, 8, 17908, 0, 17908, 1253.56, 0, 0, -11.56, 0, net, 0, 0, 21],
  ]
}

describe('Foodstory daily import', () => {
  it('maps the 18 Nov sample pair into the sales form, in either file order', () => {
    const result = parseFoodstoryReports([dailyRows(), paymentRows()], '2026-11-18')
    expect(result).toEqual({
      date: '2026-11-18',
      revenueSatang: 1_915_000,
      salesBeforeVatSatang: 1_790_800,
      vatSatang: 125_356,
      roundingSatang: -1_156,
      discountSatang: -800,
      cashSatang: 270_000,
      promptpaySatang: 834_800,
      creditCardSatang: 810_200,
      bills: 21,
      warnings: [],
    })
    expect(result.cashSatang + result.promptpaySatang + result.creditCardSatang).toBe(result.revenueSatang)
    expect(parseFoodstoryReports([paymentRows(), dailyRows()], '2026-11-18')).toEqual(result)
  })

  it('rejects an unknown payment type instead of guessing its channel', () => {
    const rows = paymentRows()
    rows[2][0] = 'Rabbit LINE Pay'
    expect(() => parseFoodstoryReports([rows, dailyRows()], '2026-11-18')).toThrow('Rabbit LINE Pay')
  })

  it('rejects a Total row that disagrees with its payment rows', () => {
    const rows = paymentRows()
    rows[7][13] = 19151
    expect(() => parseFoodstoryReports([rows, dailyRows()], '2026-11-18')).toThrow('ยอดรวมไฟล์แยกตามประเภทการชำระเงินไม่ตรง')
  })

  it('accepts a renamed Kintsu branch', () => {
    const rows = dailyRows()
    rows[2][16] = 'Kintsu Yakiniku - New Name'
    expect(parseFoodstoryReports([paymentRows(), rows], '2026-11-18').bills).toBe(21)
  })

  it('rejects a branch other than Kintsu', () => {
    const rows = paymentRows()
    rows[3][16] = 'Al Dente'
    expect(() => parseFoodstoryReports([rows, dailyRows()], '2026-11-18')).toThrow('ไม่ใช่สาขา')
  })

  it('accepts an Excel date serial in the daily file', () => {
    const rows = dailyRows()
    rows[2][0] = 46344 // 2026-11-18
    expect(parseFoodstoryReports([paymentRows(), rows], '2026-11-18').bills).toBe(21)
  })

  it('rejects a daily file for a different date than the page', () => {
    expect(() => parseFoodstoryReports([paymentRows(), dailyRows()], '2026-11-19')).toThrow('แต่หน้านี้เลือกวันที่')
  })

  it('rejects a net total that differs between the two files', () => {
    expect(() => parseFoodstoryReports([paymentRows(), dailyRows('18/11/2026', 19160)], '2026-11-18')).toThrow('รวมสุทธิ สองไฟล์ไม่ตรงกัน')
  })

  it('rejects two files of the same type', () => {
    expect(() => parseFoodstoryReports([paymentRows(), paymentRows()], '2026-11-18')).toThrow('ต้องเลือกไฟล์ Foodstory 2 ไฟล์คู่กัน')
  })

  it('rejects a 1-satang difference between payment rows and Total', () => {
    const rows = paymentRows()
    rows[7][8] = 1253.57
    expect(() => parseFoodstoryReports([rows, dailyRows()], '2026-11-18')).toThrow('ยอดรวมไฟล์แยกตามประเภทการชำระเงินไม่ตรง')
  })

  it('rejects a daily file whose Total row disagrees with its date row', () => {
    const rows = dailyRows()
    rows[3][15] = 22
    expect(() => parseFoodstoryReports([paymentRows(), rows], '2026-11-18')).toThrow('ยอดรวมไฟล์แยกตามวันไม่ตรง')
  })

})
