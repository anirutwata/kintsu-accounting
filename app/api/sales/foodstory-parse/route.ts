import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { parseFoodstoryReports } from '@/lib/foodstoryReport'
import type { ReportCell } from '@/lib/ttbPromptPayReport'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ENTRIES = 50
const MAX_INFLATED_BYTES = 20 * 1024 * 1024
const MAX_ROWS = 500
const MAX_COLUMNS = 50

// The 2 MB cap is on the compressed upload; a zip bomb would still make ExcelJS inflate
// everything. Inflate once here counting real bytes (declared sizes can lie) and stop at the cap.
// ponytail: the file is inflated twice (here + ExcelJS); bounded by the cap, fine at 2 files/request.
async function assertZipWithinLimits(buffer: Buffer, name: string) {
  const zip = await JSZip.loadAsync(buffer)
  const entries = Object.values(zip.files).filter(entry => !entry.dir)
  if (entries.length > MAX_ENTRIES) throw new Error(`ไฟล์ ${name} มีส่วนประกอบมากผิดปกติ`)
  let total = 0
  for (const entry of entries) {
    await new Promise<void>((resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer')
      stream.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > MAX_INFLATED_BYTES) { stream.pause(); reject(new Error(`ไฟล์ ${name} ใหญ่ผิดปกติเมื่อแตกไฟล์`)) }
      })
      stream.on('error', reject)
      stream.on('end', () => resolve())
    })
  }
  // A tiny sheet can reference row 100,000,000 and ExcelJS would build every index; check the XML refs before loading.
  for (const entry of entries.filter(e => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name))) {
    const xml = await entry.async('string')
    for (const m of xml.matchAll(/\br="([A-Z]*)(\d+)"/g)) {
      if (Number(m[2]) > MAX_ROWS || m[1].length > 2 || columnNumber(m[1]) > MAX_COLUMNS) {
        throw new Error(`ไฟล์ ${name} มีขนาดตารางผิดปกติ ไม่ใช่รายงาน Foodstory`)
      }
    }
  }
}

function columnNumber(letters: string) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
}

function cell(value: ExcelJS.CellValue): ReportCell {
  if (value == null || typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(part => part.text).join('')
  return String(value)
}

async function readRows(file: File): Promise<ReportCell[][]> {
  const buffer = Buffer.from(await file.arrayBuffer())
  await assertZipWithinLimits(buffer, file.name)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`ไฟล์ ${file.name} ไม่มี worksheet`)
  // Backstop for refs the XML pre-scan can't see (e.g. rows without an r attribute).
  if (sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS) throw new Error(`ไฟล์ ${file.name} มีขนาดตารางผิดปกติ ไม่ใช่รายงาน Foodstory`)
  const rows: ReportCell[][] = []
  sheet.eachRow({ includeEmpty: true }, row => {
    rows.push(Array.isArray(row.values) ? row.values.slice(1).map(cell) : [])
  })
  return rows
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  if (!cookieStore.get('kintsu_acc_user_id')?.value) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })

  const form = await req.formData()
  const date = String(form.get('date') || '')
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'วันที่ไม่ถูกต้อง' }, { status: 400 })
  if (files.length !== 2) return NextResponse.json({ error: 'ต้องเลือกไฟล์ Foodstory 2 ไฟล์พร้อมกัน' }, { status: 400 })
  for (const file of files) {
    if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: `ไฟล์ ${file.name} ไม่ใช่ .xlsx` }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `ไฟล์ ${file.name} ใหญ่เกิน 2 MB` }, { status: 400 })
  }

  try {
    const rows = await Promise.all(files.map(readRows))
    return NextResponse.json(parseFoodstoryReports(rows, date))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ' }, { status: 400 })
  }
}
