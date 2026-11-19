import { toSatang } from './money'
import { thaiShortDate } from './dailySalesLock'
import type { ReportCell } from './ttbPromptPayReport'

const PAYMENT_TITLE = 'รายงานสรุปยอดขายแยกตามประเภทการชำระเงิน'
const DAILY_TITLE = 'รายงานสรุปยอดขายแยกตามวัน'


const CARD_TYPES = ['VISA', 'Master Card', 'JCB', 'รูดบัตรเครดิต (กรณี EDC ขัดข้อง)']

export interface FoodstoryImport {
  date: string
  revenueSatang: number
  salesBeforeVatSatang: number
  vatSatang: number
  roundingSatang: number
  discountSatang: number
  cashSatang: number
  promptpaySatang: number
  creditCardSatang: number
  bills: number
  warnings: string[]
}

function text(value: ReportCell): string {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim()
}

interface Table { headers: string[]; data: ReportCell[][]; total: ReportCell[] }

function table(rows: ReportCell[][], label: string): Table {
  const headers = (rows[1] ?? []).map(text)
  const totalIndex = rows.findIndex((row, i) => i > 1 && text(row[0]) === 'Total')
  if (totalIndex < 0) throw new Error(`ไม่พบแถว Total ในไฟล์${label}`)
  const data = rows.slice(2, totalIndex).filter(row => row.some(cell => text(cell) !== ''))
  return { headers, data, total: rows[totalIndex] }
}

// Headers carry Foodstory's explanatory suffix (e.g. "รวมสุทธิ (ยอดก่อนภาษี + ...)"),
// so match the leading label instead of the full text or a fixed column letter.
function column(t: Table, key: string, label: string): number {
  const index = t.headers.findIndex(h => h === key || h.startsWith(`${key} `))
  if (index < 0) throw new Error(`ไม่พบคอลัมน์ "${key}" ในไฟล์${label}`)
  return index
}

function satang(value: ReportCell, what: string): number {
  const n = typeof value === 'number' ? value : text(value) === '' ? NaN : Number(text(value).replace(/,/g, ''))
  if (!Number.isFinite(n)) throw new Error(`${what} ไม่ใช่ตัวเลข (${text(value) || 'ว่าง'})`)
  return toSatang(n)
}

function assertBranch(t: Table, col: number, label: string) {
  for (const row of t.data) {
    // Owner: branch names may change, so only require it to be a Kintsu branch.
    if (!/kintsu/i.test(text(row[col]))) throw new Error(`ไฟล์${label}ไม่ใช่สาขา Kintsu: ${text(row[col]) || '(ว่าง)'}`)
  }
}

export function parseFoodstoryReports(files: ReportCell[][][], expectedDate: string): FoodstoryImport {
  if (files.length !== 2) throw new Error('ต้องเลือกไฟล์ Foodstory 2 ไฟล์: ยอดขายแยกตามประเภทการชำระเงิน และ ยอดขายแยกตามวัน')
  const paymentRows = files.find(rows => text(rows[0]?.[0]) === PAYMENT_TITLE)
  const dailyRows = files.find(rows => text(rows[0]?.[0]) === DAILY_TITLE)
  if (!paymentRows || !dailyRows || paymentRows === dailyRows) {
    throw new Error(`ต้องเลือกไฟล์ Foodstory 2 ไฟล์คู่กัน: "${PAYMENT_TITLE}" และ "${DAILY_TITLE}"`)
  }

  const aLabel = 'แยกตามประเภทการชำระเงิน'
  const A = table(paymentRows, aLabel)
  const aCol = {
    type: column(A, 'ประเภทการชำระเงิน', aLabel),
    discount: column(A, 'ส่วนลด ส่วนลดสินค้า', aLabel),
    beforeVat: column(A, 'ยอดก่อนภาษี', aLabel),
    vat: column(A, 'ภาษี', aLabel),
    nonVat: column(A, 'ยอดขายสินค้าไม่มีภาษี', aLabel),
    voucher: column(A, 'มูลค่า Voucher', aLabel),
    voucherDiscount: column(A, 'ส่วนลด Voucher', aLabel),
    rounding: column(A, 'ยอดปัดเศษ', aLabel),
    net: column(A, 'รวมสุทธิ', aLabel),
    tip: column(A, 'ทิป', aLabel),
    refund: column(A, 'คืนเงิน', aLabel),
    branch: column(A, 'สาขา', aLabel),
  }
  const bLabel = 'แยกตามวัน'
  const B = table(dailyRows, bLabel)
  const bCol = {
    date: column(B, 'วันที่', bLabel),
    itemDiscount: column(B, 'ส่วนลดสินค้า', bLabel),
    billDiscount: column(B, 'ส่วนลดบิล', bLabel),
    beforeVat: column(B, 'ยอดก่อนภาษี', bLabel),
    vat: column(B, 'ภาษี', bLabel),
    voucher: column(B, 'มูลค่า Voucher', bLabel),
    voucherDiscount: column(B, 'ส่วนลด Voucher', bLabel),
    rounding: column(B, 'ยอดปัดเศษ', bLabel),
    delivery: column(B, 'ค่าจัดส่ง', bLabel),
    net: column(B, 'รวมสุทธิ', bLabel),
    tip: column(B, 'ทิป', bLabel),
    refund: column(B, 'คืนเงิน', bLabel),
    bills: column(B, 'จำนวนบิล', bLabel),
    branch: column(B, 'สาขา', bLabel),
  }

  if (A.data.length === 0) throw new Error('ไฟล์แยกตามประเภทการชำระเงินไม่มีรายการ')
  if (B.data.length !== 1) throw new Error(`ไฟล์แยกตามวันต้องมี 1 วันเท่านั้น (พบ ${B.data.length} แถว)`)
  assertBranch(A, aCol.branch, aLabel)
  assertBranch(B, bCol.branch, bLabel)

  const bRow = B.data[0]
  const dateCell = bRow[bCol.date]
  const match = text(dateCell).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  // Excel stores real date cells as a day serial (days since 1899-12-30), e.g. 46346 = 2026-11-20.
  const isSerial = typeof dateCell === 'number' && Number.isInteger(dateCell) && dateCell > 40000 && dateCell < 80000
  const fileDate = dateCell instanceof Date ? dateCell.toISOString().slice(0, 10)
    : isSerial ? new Date(Date.UTC(1899, 11, 30) + dateCell * 86_400_000).toISOString().slice(0, 10)
    : match ? `${match[3]}-${match[2]}-${match[1]}` : ''
  if (!fileDate) throw new Error(`วันที่ในไฟล์แยกตามวันไม่ถูกต้อง: ${text(dateCell) || '(ว่าง)'}`)
  if (fileDate !== expectedDate) {
    throw new Error(`ไฟล์ Foodstory เป็นของวันที่ ${thaiShortDate(fileDate)} แต่หน้านี้เลือกวันที่ ${thaiShortDate(expectedDate)}`)
  }

  const unknown = [...new Set(A.data.map(row => text(row[aCol.type])))]
    .filter(type => type !== 'Cash' && type !== 'Bank Transfer' && !CARD_TYPES.includes(type))
  if (unknown.length) throw new Error(`พบประเภทการชำระเงินที่ระบบไม่รู้จัก: ${unknown.join(', ')} — แจ้งผู้ดูแลระบบก่อนนำเข้า`)

  const amountCols = ['discount', 'beforeVat', 'vat', 'nonVat', 'voucher', 'voucherDiscount', 'rounding', 'net', 'tip', 'refund'] as const
  const total = {} as Record<typeof amountCols[number], number>
  for (const key of amountCols) {
    const header = A.headers[aCol[key]]
    const sum = A.data.reduce((s, row) => s + satang(row[aCol[key]], `${header} (${text(row[aCol.type])})`), 0)
    total[key] = satang(A.total[aCol[key]], `${header} (Total)`)
    if (sum !== total[key]) {
      throw new Error(`ยอดรวมไฟล์แยกตามประเภทการชำระเงินไม่ตรง: ${header} รวมรายการ ${sum / 100} แต่ Total ${total[key] / 100}`)
    }
  }
  if (total.beforeVat + total.vat + total.rounding - total.nonVat !== total.net) {
    throw new Error('ยอดก่อนภาษี + ภาษี + ยอดปัดเศษ ไม่เท่ากับรวมสุทธิ ในไฟล์แยกตามประเภทการชำระเงิน')
  }

  const b = (key: keyof typeof bCol) => satang(bRow[bCol[key]], `${B.headers[bCol[key]]} (ไฟล์แยกตามวัน)`)
  const bAmountCols = ['itemDiscount', 'billDiscount', 'beforeVat', 'vat', 'voucher', 'voucherDiscount', 'rounding', 'delivery', 'net', 'tip', 'refund', 'bills'] as const
  for (const key of bAmountCols) {
    const bTotal = satang(B.total[bCol[key]], `${B.headers[bCol[key]]} (Total ไฟล์แยกตามวัน)`)
    if (b(key) !== bTotal) {
      throw new Error(`ยอดรวมไฟล์แยกตามวันไม่ตรง: ${B.headers[bCol[key]]} รายการ ${b(key) / 100} แต่ Total ${bTotal / 100}`)
    }
  }
  const crossChecks: [string, number, number][] = [
    ['รวมสุทธิ', total.net, b('net')],
    ['ยอดก่อนภาษี', total.beforeVat, b('beforeVat')],
    ['ภาษี', total.vat, b('vat')],
    ['ยอดปัดเศษ', total.rounding, b('rounding')],
    ['ส่วนลด', total.discount, b('itemDiscount') + b('billDiscount')],
  ]
  for (const [label, a, bValue] of crossChecks) {
    if (a !== bValue) throw new Error(`${label} สองไฟล์ไม่ตรงกัน: แยกตามประเภทการชำระเงิน ${a / 100} แต่แยกตามวัน ${bValue / 100}`)
  }

  const billsValue = b('bills') / 100
  if (!Number.isInteger(billsValue) || billsValue < 0) throw new Error(`จำนวนบิลไม่ถูกต้อง: ${billsValue}`)

  const warnings: string[] = []
  const warn = (label: string, value: number) => { if (value !== 0) warnings.push(`มี${label} ${value / 100} บาท — ตรวจสอบก่อนบันทึก`) }
  warn('ทิป', total.tip || b('tip'))
  warn('Voucher', total.voucher || b('voucher'))
  warn('ส่วนลด Voucher', total.voucherDiscount || b('voucherDiscount'))
  warn('คืนเงิน', total.refund || b('refund'))
  warn('ยอดขายสินค้าไม่มีภาษี', total.nonVat)
  warn('ค่าจัดส่ง', b('delivery'))

  const channel = (types: string[]) => A.data
    .filter(row => types.includes(text(row[aCol.type])))
    .reduce((s, row) => s + satang(row[aCol.net], 'รวมสุทธิ'), 0)

  return {
    date: fileDate,
    revenueSatang: total.net,
    salesBeforeVatSatang: total.beforeVat,
    vatSatang: total.vat,
    roundingSatang: total.rounding,
    discountSatang: -total.discount || 0,
    cashSatang: channel(['Cash']),
    promptpaySatang: channel(['Bank Transfer']),
    creditCardSatang: channel(CARD_TYPES),
    bills: billsValue,
    warnings,
  }
}
