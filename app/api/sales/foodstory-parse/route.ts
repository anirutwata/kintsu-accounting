import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import ExcelJS from 'exceljs'
import { parseFoodstoryReports } from '@/lib/foodstoryReport'
import type { ReportCell } from '@/lib/ttbPromptPayReport'

const MAX_BYTES = 2 * 1024 * 1024

function cell(value: ExcelJS.CellValue): ReportCell {
  if (value == null || typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(part => part.text).join('')
  return String(value)
}

async function readRows(file: File): Promise<ReportCell[][]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`ไฟล์ ${file.name} ไม่มี worksheet`)
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
