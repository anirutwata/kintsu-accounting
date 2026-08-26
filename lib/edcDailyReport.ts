import { LINEPAY_EDC_POLICY } from './edcPolicy'

export interface EdcTransaction {
  merchantId: string
  merchantName: string
  terminalId: string
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

export function parseEdcDailyReport(source: string, filename: string): EdcDailyReport {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ''))
  const headers = rows[0] ?? []
  const requiredHeaders = [
    'merchant_id', 'merchant_name', 'terminal_id', 'service_group_name', 'service_name',
    'amount', 'fee_rate', 'fee_amount', 'vat_amount', 'net_amount', 'settlement_date',
    'transaction_time', 'transaction_id',
  ]
  if (headers.join(',') !== requiredHeaders.join(',')) {
    throw new Error('หัวตารางไฟล์ EDC CSV ไม่ถูกต้อง')
  }
  const filenameMatch = filename.match(/^EDC_DailyReport_(\d{4})(\d{2})(\d{2})\.csv$/i)
  if (!filenameMatch) throw new Error(`ชื่อไฟล์รายงาน EDC ไม่ถูกต้อง: ${filename || '(ว่าง)'}`)
  const filenameDate = `${filenameMatch[1]}-${filenameMatch[2]}-${filenameMatch[3]}`

  const transactions = rows.slice(1).map((row): EdcTransaction => ({
    merchantId: row[0]?.trim(),
    merchantName: row[1]?.trim(),
    terminalId: row[2]?.trim(),
    serviceGroupName: row[3]?.trim(),
    serviceName: row[4]?.trim(),
    amountSatang: satang(row[5], 'amount'),
    feeRate: Number(row[6]),
    feeAmountSatang: satang(row[7], 'fee_amount'),
    feeVatSatang: satang(row[8], 'vat_amount'),
    netAmountSatang: satang(row[9], 'net_amount'),
    settlementDate: row[10]?.trim(),
    transactionTime: row[11]?.trim(),
    transactionId: row[12]?.trim(),
  }))
  if (transactions.length === 0) throw new Error('รายงาน EDC ไม่มีรายการ')

  const first = transactions[0]
  if (filenameDate !== first.settlementDate) {
    throw new Error(`วันที่ชื่อไฟล์ EDC ไม่ตรงกับ Settlement: ชื่อไฟล์ ${filenameDate} แต่รายการ ${first.settlementDate}`)
  }
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
  if (transactions.some(item => item.transactionTime.slice(0, 10) >= first.settlementDate)) {
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
  const revenueDays = Array.from(new Set(transactions.map(item => item.transactionTime.slice(0, 10))))
    .sort()
    .map((date): EdcRevenueDay => {
      const items = transactions.filter(item => item.transactionTime.slice(0, 10) === date)
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
