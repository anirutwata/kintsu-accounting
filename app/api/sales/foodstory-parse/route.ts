import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import JSZip from 'jszip'
import { parseFoodstoryReports } from '@/lib/foodstoryReport'
import type { ReportCell } from '@/lib/ttbPromptPayReport'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ENTRIES = 50
const MAX_INFLATED_BYTES = 2 * 1024 * 1024 // real Foodstory sheet XML is ~8 KB
const MAX_ROWS = 500
const MAX_COLUMNS = 50
const MAX_SHARED_STRINGS = 5000

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

// indexOf scanner instead of regex: always moves forward, so it stays linear on hostile XML.
// Yields [openTagAttributes, innerXml] for each <tag ...>...</tag> or <tag .../>.
function* elements(xml: string, tag: string): Generator<[string, string]> {
  let i = 0
  while ((i = xml.indexOf('<' + tag, i)) !== -1) {
    const after = xml[i + tag.length + 1]
    if (after === undefined || !/[\s>/]/.test(after)) { i += tag.length + 1; continue } // e.g. <cols when looking for <c
    const openEnd = xml.indexOf('>', i)
    if (openEnd === -1) throw new Error('XML ไม่สมบูรณ์')
    const attrs = xml.slice(i + tag.length + 1, openEnd)
    if (attrs.endsWith('/')) { yield [attrs.slice(0, -1), '']; i = openEnd + 1; continue }
    const close = xml.indexOf('</' + tag + '>', openEnd)
    if (close === -1) throw new Error('XML ไม่สมบูรณ์')
    yield [attrs, xml.slice(openEnd + 1, close)]
    i = close + tag.length + 3
  }
}

function textRuns(xml: string) {
  let out = ''
  for (const [, inner] of elements(xml, 't')) out += decodeXml(inner)
  return out
}

function columnNumber(letters: string) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
}

async function readRows(file: File): Promise<ReportCell[][]> {
  const bad = new Error(`ไฟล์ ${file.name} ไม่ใช่รายงาน Foodstory ที่อ่านได้`)
  let zip: JSZip
  try { zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer())) } catch { throw bad }
  if (Object.keys(zip.files).length > MAX_ENTRIES) throw new Error(`ไฟล์ ${file.name} มีส่วนประกอบมากผิดปกติ`)
  // Foodstory exports have exactly one sheet; refusing extra sheets avoids having to resolve sheet order.
  const sheets = Object.keys(zip.files).filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n))
  if (sheets.length !== 1 || sheets[0] !== 'xl/worksheets/sheet1.xml') throw new Error(`ไฟล์ ${file.name} ต้องมี 1 sheet เท่านั้น`)
  const budget = { left: MAX_INFLATED_BYTES }
  try {
    const sheetXml = await inflate(zip.file(sheets[0])!, budget, file.name)
    const sstEntry = zip.file('xl/sharedStrings.xml')
    const shared: string[] = []
    if (sstEntry) {
      for (const [, inner] of elements(await inflate(sstEntry, budget, file.name), 'si')) {
        if (shared.push(textRuns(inner)) > MAX_SHARED_STRINGS) throw bad
      }
    }

    const rows: ReportCell[][] = []
    for (const [attrs, body] of elements(sheetXml, 'c')) {
      const ref = attrs.match(/\br="([A-Z]{1,3})(\d{1,7})"/)
      if (!ref) throw bad
      const col = columnNumber(ref[1]), row = Number(ref[2])
      if (row > MAX_ROWS || col > MAX_COLUMNS) throw new Error(`ไฟล์ ${file.name} มีขนาดตารางผิดปกติ ไม่ใช่รายงาน Foodstory`)
      const type = attrs.match(/\bt="([^"]*)"/)?.[1] ?? 'n'
      let v: string | undefined
      for (const [, inner] of elements(body, 'v')) { v = inner.trim() || undefined; break } // <v/> = no value, never 0
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
  } catch (error) {
    if (error instanceof Error && error.message === 'XML ไม่สมบูรณ์') throw bad
    throw error
  }
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
