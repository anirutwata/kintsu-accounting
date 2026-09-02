export type ReportCell = string | number | Date | null | undefined

export interface TtbPromptPayTransaction {
  bankReference: string
  paymentDate: string
  paymentTime: string
  amountSatang: number
  status: string
  paymentChannel: string
  payerBank: string
  payerName: string
}

export interface TtbPromptPayReport {
  reportDate: string
  merchantId: string
  successfulCount: number
  successfulAmountSatang: number
  voidedCount: number
  voidedAmountSatang: number
  transactions: TtbPromptPayTransaction[]
}

function text(value: ReportCell): string {
  return value == null ? '' : String(value).trim()
}

function thaiReportDate(value: ReportCell): string {
  const match = text(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) throw new Error(`วันที่ในรายงาน TTB ไม่ถูกต้อง: ${text(value) || '(ว่าง)'}`)
  return `${match[3]}-${match[2]}-${match[1]}`
}

export function reportDateFromTtbFilename(filename: string): string {
  const match = filename.trim().match(/^Report_Kintsu-(\d{2})-(\d{2})-(\d{4})\.xlsx$/i)
  if (!match) throw new Error(`ชื่อไฟล์รายงาน TTB ไม่ถูกต้อง: ${filename || '(ว่าง)'}`)
  return thaiReportDate(`${match[1]}/${match[2]}/${match[3]}`)
}

export function assertTtbFilenameMatchesReportDate(filename: string, reportDate: string): void {
  // TTB's "resend on request" email (used to backfill a day whose automatic 03:00
  // report never arrived) attaches a generic Report_Kintsu.xlsx with no date in the
  // name — fall back to the workbook's own date checks (summary date vs. transaction
  // date, already enforced in parseTtbSmartShopRows) instead of a filename cross-check.
  if (/^Report_Kintsu\.xlsx$/i.test(filename.trim())) return
  const filenameDate = reportDateFromTtbFilename(filename)
  if (filenameDate !== reportDate) {
    throw new Error(`วันที่ชื่อไฟล์ TTB ไม่ตรงกับวันที่รับเงิน: ชื่อไฟล์ ${filenameDate} แต่รายการ ${reportDate}`)
  }
}

function number(value: ReportCell, label: string): number {
  const result = typeof value === 'number' ? value : Number(text(value).replace(/,/g, ''))
  if (!Number.isFinite(result)) throw new Error(`${label} ในรายงาน TTB ไม่ใช่ตัวเลข`)
  return result
}

export function parseTtbSmartShopRows(rows: ReportCell[][]): TtbPromptPayReport {
  const merchantId = text(rows[1]?.[1])
  if (!merchantId) throw new Error('ไม่พบ Merchant ID ในรายงาน TTB')

  const headerIndex = rows.findIndex(row => text(row[0]) === 'Transaction ID')
  if (headerIndex < 0) throw new Error('ไม่พบหัวตาราง Transaction ในรายงาน TTB')

  const summaryCountRow = rows.find(row => text(row[0]) === 'จำนวนรายการสำเร็จ')
  const summaryAmountRow = rows.find(row => text(row[0]) === 'ยอดเงินรายการสำเร็จ')
  const voidCountRow = rows.find(row => text(row[0]) === 'จำนวนรายการคืนเงินสำเร็จ')
  const voidAmountRow = rows.find(row => text(row[0]) === 'ยอดเงินรายการคืนเงินสำเร็จ')
  if (!summaryCountRow || !summaryAmountRow) throw new Error('ไม่พบยอดสรุปในรายงาน TTB')

  const transactions: TtbPromptPayTransaction[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    const status = text(row[4])
    if (!status) continue
    if (status !== 'Success') continue
    const amount = number(row[3], 'Payment Amount')
    const bankReference = text(row[13])
    if (!bankReference) throw new Error('พบรายการ Success ที่ไม่มี Bank Ref')
    transactions.push({
      bankReference,
      paymentDate: thaiReportDate(row[1]),
      paymentTime: text(row[2]),
      amountSatang: Math.round(amount * 100),
      status,
      paymentChannel: text(row[5]),
      payerBank: text(row[6]),
      payerName: text(row[12]),
    })
  }

  if (transactions.length === 0) throw new Error('รายงาน TTB ไม่มีรายการ Success')
  const reportDates = new Set(transactions.map(item => item.paymentDate))
  if (reportDates.size !== 1) throw new Error('รายงาน TTB มีรายการ Success มากกว่าหนึ่งวัน')
  const transactionDate = transactions[0].paymentDate

  const summaryDateCell = rows.flat().map(text).find(value => value.includes('สรุปรายการสำหรับวันที่'))
  const summaryDateMatch = summaryDateCell?.match(/สรุปรายการสำหรับวันที่\s*(\d{2}\/\d{2}\/\d{4})/)
  if (!summaryDateMatch) throw new Error('ไม่พบวันที่สรุปในรายงาน TTB')
  const summaryDate = thaiReportDate(summaryDateMatch[1])
  if (summaryDate !== transactionDate) {
    throw new Error(`วันที่สรุปในรายงาน TTB ไม่ตรงกับวันที่รับเงิน: สรุป ${summaryDate} แต่รายการ ${transactionDate}`)
  }

  const successfulCount = Math.round(number(summaryCountRow[1], 'จำนวนรายการสำเร็จ'))
  const successfulAmountSatang = Math.round(number(summaryAmountRow[1], 'ยอดเงินรายการสำเร็จ') * 100)
  const calculatedAmount = transactions.reduce((sum, item) => sum + item.amountSatang, 0)
  if (successfulCount !== transactions.length) {
    throw new Error(`จำนวนรายการ TTB ไม่ตรง: รายละเอียด ${transactions.length} แต่สรุป ${successfulCount}`)
  }
  if (successfulAmountSatang !== calculatedAmount) {
    throw new Error(`ยอด TTB ไม่ตรง: รายละเอียด ${calculatedAmount} สตางค์ แต่สรุป ${successfulAmountSatang} สตางค์`)
  }

  return {
    reportDate: transactionDate,
    merchantId,
    successfulCount,
    successfulAmountSatang,
    voidedCount: voidCountRow ? Math.round(number(voidCountRow[1], 'จำนวนรายการคืนเงินสำเร็จ')) : 0,
    voidedAmountSatang: voidAmountRow ? Math.round(number(voidAmountRow[1], 'ยอดคืนเงินสำเร็จ') * 100) : 0,
    transactions,
  }
}
