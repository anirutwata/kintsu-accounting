import ExcelJS from 'exceljs'
import officeCrypto from 'officecrypto-tool'
import { assertTtbFilenameMatchesReportDate, parseTtbSmartShopRows, type ReportCell, type TtbPromptPayReport } from './ttbPromptPayReport'

export async function readEncryptedTtbReport(buffer: Buffer, password: string, attachmentName: string): Promise<TtbPromptPayReport> {
  // officecrypto-tool bundles an older @types/node Buffer declaration; runtime value is
  // the same Node Buffer, so bridge the declaration mismatch at this boundary.
  const decrypted = await officeCrypto.decrypt(buffer as never, { password })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(decrypted) as never)
  const sheet = workbook.getWorksheet('Transaction') ?? workbook.worksheets[0]
  if (!sheet) throw new Error('ไม่พบ worksheet Transaction ในรายงาน TTB')
  const rows: ReportCell[][] = []
  sheet.eachRow({ includeEmpty: true }, row => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push(values.map(value => value instanceof Date || typeof value === 'string' || typeof value === 'number' ? value : value == null ? null : String(value)))
  })
  const report = parseTtbSmartShopRows(rows)
  assertTtbFilenameMatchesReportDate(attachmentName, report.reportDate)
  return report
}
