import { LINEPAY_EDC_POLICY } from './edcPolicy'

export interface EdcTransaction {
  merchantId: string
  merchantName: string
  serviceGroupName: string
  serviceName: string
  amountSatang: number
  feeRate: number
  feeAmountSatang: number
  feeVatSatang: number
  netAmountSatang: number
  settlementDate: string
  transactionTime: string
  transactionId: string
}

export interface EdcDailyReport {
  revenueDate: string
  revenueDays: EdcRevenueDay[]
  settlementDate: string
  merchantId: string
  merchantName: string
  terminalId: string
  transactionCount: number
  grossAmountSatang: number
  feeAmountSatang: number
  feeVatSatang: number
  netAmountSatang: number
  transactions: EdcTransaction[]
}

export interface EdcRevenueDay {
  revenueDate: string
  transactionCount: number
  grossAmountSatang: number
  feeAmountSatang: number
  feeVatSatang: number
  netAmountSatang: number
}

function parseCsvRows(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/, ''))
    if (row.some(value => value !== '')) rows.push(row)
  }
  if (quoted) throw new Error('ไฟล์ EDC CSV มีเครื่องหมายคำพูดไม่ครบ')
  return rows
}

function satang(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} ในรายงาน EDC ไม่ใช่ตัวเลข`)
  return Math.round(parsed * 100)
}

function dayBefore(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

// Confirmed 2026-09-03: every transaction_time in that settlement exactly equaled
// settlement_date instead of preceding it, but the store's own POS credit-card total
// for settlement_date minus one day matched this settlement's total to the baht — so
// transaction_time was reporting LINE Pay's batch/settlement processing moment, not the
// actual point-of-sale time, for that file. When a transaction's date lands exactly on
// its own settlement date, treat it as belonging to the day before instead of trusting
// the raw timestamp; any date genuinely on or after settlement in another way (i.e.
// still not before settlement after that correction) remains a hard rejection.
function effectiveRevenueDate(transactionDate: string, settlementDate: string): string {
  return transactionDate === settlementDate ? dayBefore(settlementDate) : transactionDate
}

// LINE Pay's CSV export format (column names, order, and the exact set of columns
// present) has already changed on us more than once — a renamed column and a dropped
// footnote elsewhere in this file broke a strict format check without the underlying
// data ever being wrong. So this parser only requires the columns it actually reads,
// looked up by name rather than position — reordering, adding, or dropping an unused
// column (like terminal_id/reference_id, which was never validated — see below) no
// longer breaks import. Only the data itself is still validated strictly: merchant
// identity, settlement-after-sale-date, and per-row amount reconciliation, further
// down in this function.
const REQUIRED_COLUMNS = [
  'merchant_id', 'merchant_name', 'service_group_name', 'service_name',
  'amount', 'fee_rate', 'fee_amount', 'vat_amount', 'net_amount',
  'settlement_date', 'transaction_time', 'transaction_id',
] as const

export function parseEdcDailyReport(source: string): EdcDailyReport {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ''))
  const headers = rows[0] ?? []
  const columnIndex = new Map(headers.map((name, index) => [name.trim(), index]))
  const missingColumns = REQUIRED_COLUMNS.filter(name => !columnIndex.has(name))
  if (missingColumns.length > 0) {
    throw new Error(`หัวตารางไฟล์ EDC CSV ไม่มีคอลัมน์: ${missingColumns.join(', ')}`)
  }
  const col = (name: typeof REQUIRED_COLUMNS[number]) => columnIndex.get(name) as number

  const transactions = rows.slice(1).map((row): EdcTransaction => ({
    merchantId: row[col('merchant_id')]?.trim(),
    merchantName: row[col('merchant_name')]?.trim(),
    serviceGroupName: row[col('service_group_name')]?.trim(),
    serviceName: row[col('service_name')]?.trim(),
    amountSatang: satang(row[col('amount')], 'amount'),
    feeRate: Number(row[col('fee_rate')]),
    feeAmountSatang: satang(row[col('fee_amount')], 'fee_amount'),
    feeVatSatang: satang(row[col('vat_amount')], 'vat_amount'),
    netAmountSatang: satang(row[col('net_amount')], 'net_amount'),
    settlementDate: row[col('settlement_date')]?.trim(),
    transactionTime: row[col('transaction_time')]?.trim(),
    transactionId: row[col('transaction_id')]?.trim(),
  }))
  if (transactions.length === 0) throw new Error('รายงาน EDC ไม่มีรายการ')

  const first = transactions[0]
  // terminal_id on LINE Pay's report varies with the customer's card scheme (Visa/
  // Mastercard vs. JCB use different terminal IDs on the same physical device) — it does
  // not identify which store the report belongs to, so it isn't validated here at all.
  // merchant_id/merchant_name below are the actual, reliable identity check.
  if (new Set(transactions.map(item => item.merchantId)).size !== 1
    || new Set(transactions.map(item => item.merchantName)).size !== 1) {
    throw new Error('รายงาน EDC มีข้อมูลร้านค้ามากกว่าหนึ่งราย')
  }
  const currentNameMatches = LINEPAY_EDC_POLICY.merchantNameIncludes.every(part => first.merchantName.includes(part))
  const legacyNameMatches = LINEPAY_EDC_POLICY.merchantLegacyNames.some(name => name === first.merchantName)
  if (first.merchantId !== LINEPAY_EDC_POLICY.merchantId || (!currentNameMatches && !legacyNameMatches)) {
    throw new Error('รายงาน EDC ไม่ใช่ร้าน KINTSU Central Khon Kaen Campus')
  }
  if (new Set(transactions.map(item => item.settlementDate)).size !== 1) {
    throw new Error('รายงาน EDC มี Settlement Date มากกว่าหนึ่งวัน')
  }
  if (transactions.some(item => effectiveRevenueDate(item.transactionTime.slice(0, 10), first.settlementDate) >= first.settlementDate)) {
    throw new Error('Settlement EDC ต้องอยู่หลังวันขายทุกรายการ')
  }
  const transactionIds = transactions.map(item => item.transactionId)
  if (transactionIds.some(id => !id)) throw new Error('รายงาน EDC มีรายการที่ไม่มี Transaction ID')
  if (new Set(transactionIds).size !== transactionIds.length) throw new Error('Transaction ID EDC ซ้ำในไฟล์เดียวกัน')
  for (const transaction of transactions) {
    if (transaction.serviceGroupName !== 'EDC'
      || !['CREDIT_CARD_LOCAL', 'CREDIT_CARD_INTER', 'JCB_CARD', 'DEBIT_CARD', 'QR_PROMPTPAY', 'UPI_CARD'].includes(transaction.serviceName)) {
      throw new Error(`ประเภทรายการ EDC ไม่รองรับ: ${transaction.serviceName || '(ว่าง)'}`)
    }
    if (transaction.amountSatang <= 0 || transaction.feeAmountSatang < 0 || transaction.feeVatSatang < 0
      || transaction.netAmountSatang < 0 || !Number.isFinite(transaction.feeRate)) {
      throw new Error(`จำนวนเงิน EDC ไม่ถูกต้อง: ${transaction.transactionId}`)
    }
    if (transaction.amountSatang - transaction.feeAmountSatang - transaction.feeVatSatang !== transaction.netAmountSatang) {
      throw new Error(`ยอดสุทธิ EDC ไม่ตรงกับยอดขายหักค่าธรรมเนียมและ VAT: ${transaction.transactionId}`)
    }
  }
  const grossAmountSatang = transactions.reduce((sum, item) => sum + item.amountSatang, 0)
  const feeAmountSatang = transactions.reduce((sum, item) => sum + item.feeAmountSatang, 0)
  const feeVatSatang = transactions.reduce((sum, item) => sum + item.feeVatSatang, 0)
  const netAmountSatang = transactions.reduce((sum, item) => sum + item.netAmountSatang, 0)
  const revenueDays = Array.from(new Set(transactions.map(item => effectiveRevenueDate(item.transactionTime.slice(0, 10), first.settlementDate))))
    .sort()
    .map((date): EdcRevenueDay => {
      const items = transactions.filter(item => effectiveRevenueDate(item.transactionTime.slice(0, 10), first.settlementDate) === date)
      return {
        revenueDate: date,
        transactionCount: items.length,
        grossAmountSatang: items.reduce((sum, item) => sum + item.amountSatang, 0),
        feeAmountSatang: items.reduce((sum, item) => sum + item.feeAmountSatang, 0),
        feeVatSatang: items.reduce((sum, item) => sum + item.feeVatSatang, 0),
        netAmountSatang: items.reduce((sum, item) => sum + item.netAmountSatang, 0),
      }
    })

  return {
    revenueDate: revenueDays[0].revenueDate,
    revenueDays,
    settlementDate: first.settlementDate,
    merchantId: first.merchantId,
    merchantName: first.merchantName,
    // Not first.terminalId — terminal_id varies by card scheme within the same report
    // (see the comment above), so "whichever row happened to come first" isn't a
    // meaningful value to store. This is purely a human-readable label for the one
    // physical EDC device the store has; it plays no role in validation.
    terminalId: LINEPAY_EDC_POLICY.terminalId,
    transactionCount: transactions.length,
    grossAmountSatang,
    feeAmountSatang,
    feeVatSatang,
    netAmountSatang,
    transactions,
  }
}
