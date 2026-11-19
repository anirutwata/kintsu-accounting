import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import JSZip from 'jszip'
import { parseFoodstoryReports } from '@/lib/foodstoryReport'
import type { ReportCell } from '@/lib/ttbPromptPayReport'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ENTRIES = 50
const MAX_INFLATED_BYTES = 20 * 1024 * 1024
const MAX_ROWS = 500
const MAX_COLUMNS = 50

// No ExcelJS here on purpose: its load() expands merges, validations, defined names and column
// ranges from tiny metadata (memory bombs). Foodstory exports are one plain sheet, so read only the
// sheet XML (+ shared strings if present) and ignore all other metadata.
async function inflate(entry: JSZip.JSZipObject, budget: { left: number }, name: string): Promise<string> {
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer')
    stream.on('data', (chunk: Buffer) => {
      budget.left -= chunk.length
      if (budget.left < 0) { stream.pause(); reject(new Error(`ไฟล์ ${name} ใหญ่ผิดปกติเมื่อแตกไฟล์`)) }
      else chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  return Buffer.concat(chunks).toString('utf8')
}

function decodeXml(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()])
}

function textRuns(xml: string) {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1])).join('')
}

function columnNumber(letters: string) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
}

async function readRows(file: File): Promise<ReportCell[][]> {
  const bad = new Error(`ไฟล์ ${file.name} ไม่ใช่รายงาน Foodstory ที่อ่านได้`)
  let zip: JSZip
  try { zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer())) } catch { throw bad }
  if (Object.keys(zip.files).length > MAX_ENTRIES) throw new Error(`ไฟล์ ${file.name} มีส่วนประกอบมากผิดปกติ`)
  const sheetEntry = zip.file('xl/worksheets/sheet1.xml')
  if (!sheetEntry) throw bad
  const budget = { left: MAX_INFLATED_BYTES }
  const sheetXml = await inflate(sheetEntry, budget, file.name)
  const sstEntry = zip.file('xl/sharedStrings.xml')
  const shared = sstEntry
    ? [...(await inflate(sstEntry, budget, file.name)).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textRuns(m[1]))
    : []

  const rows: ReportCell[][] = []
  for (const m of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]
    const ref = attrs.match(/\br="([A-Z]{1,3})(\d+)"/)
    if (!ref) throw bad
    const col = columnNumber(ref[1]), row = Number(ref[2])
    if (row > MAX_ROWS || col > MAX_COLUMNS) throw new Error(`ไฟล์ ${file.name} มีขนาดตารางผิดปกติ ไม่ใช่รายงาน Foodstory`)
    const type = attrs.match(/\bt="([^"]*)"/)?.[1] ?? 'n'
    const body = m[2] ?? ''
    const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
    let value: ReportCell = null
    if (type === 'inlineStr') value = textRuns(body)
    else if (type === 's') value = v == null ? null : shared[Number(v)] ?? null
    else if (type === 'str' || type === 'e') value = v == null ? null : decodeXml(v)
    else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
    else if (v != null) value = Number(v)
    while (rows.length < row) rows.push([])
    rows[row - 1][col - 1] = value
  }
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
