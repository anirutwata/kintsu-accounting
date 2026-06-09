import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

interface StatementEntry {
  date: string
  description: string
  amount: number
  type: 'in' | 'out'
}

interface SystemEntry {
  date: string
  description: string
  amount: number
  type: 'in' | 'out'
  source: 'expense' | 'sales' | 'sales_cash' | 'transfer'
  id?: string
}

interface MatchItem {
  statement: StatementEntry
  system: SystemEntry
  dayDiff: number
  amountDiff: number
}

function daysBetween(d1: string, d2: string): number {
  return Math.round((new Date(d1).getTime() - new Date(d2).getTime()) / 86400000)
}

function bankMatches(stored: string | null, selected: string): boolean {
  if (!stored || !selected) return false
  const a = stored.toLowerCase().replace(/\s/g, '')
  const b = selected.toLowerCase().replace(/\s/g, '')
  const keywords: Record<string, string[]> = {
    ttb: ['ttb', 'ทหารไทย', 'ทหารไทยธนชาต', 'tmb', 'thanachart'],
    kbank: ['kbank', 'กสิกร', 'kasikorn'],
    bbl: ['bbl', 'กรุงเทพ', 'bangkok'],
    scb: ['scb', 'ไทยพาณิชย์', 'siam'],
    ktb: ['ktb', 'กรุงไทย', 'krungthai'],
    bay: ['bay', 'กรุงศรี', 'ayudhya'],
    gsb: ['gsb', 'ออมสิน'],
  }
  // Direct contains match
  if (a.includes(b) || b.includes(a)) return true
  // Keyword group match
  for (const keys of Object.values(keywords)) {
    if (keys.some(k => a.includes(k)) && keys.some(k => b.includes(k))) return true
  }
  return false
}

// Parse PDF using Claude Vision
async function parsePdfWithClaude(file: File): Promise<StatementEntry[]> {
  const anthropic = new Anthropic()
  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    messages: [{
      role: 'user',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as any,
        {
          type: 'text',
          text: `You are extracting transactions from a Thai bank statement PDF.

TASK: Extract EVERY transaction row. Return ONLY a raw JSON array — no markdown, no code fences, no explanation.

OUTPUT FORMAT (each item):
{"date":"YYYY-MM-DD","description":"...","amount":1234.56,"type":"in"}

DATE RULES (Thai Buddhist Era, 2-digit year):
- Year "68" = 2568 BE = 2568-543 = 2025 CE
- Year "69" = 2569 BE = 2569-543 = 2026 CE
- Month abbreviations: ม.ค.=01 ก.พ.=02 มี.ค.=03 เม.ย.=04 พ.ค.=05 มิ.ย.=06 ก.ค.=07 ส.ค.=08 ก.ย.=09 ต.ค.=10 พ.ย.=11 ธ.ค.=12
- Example: "9 มิ.ย. 69" → "2026-06-09", "30 มี.ค. 69" → "2026-03-30"

AMOUNT RULES (จำนวนเงิน column):
- Positive (+) or no sign → type "in"
- Negative (-) → type "out"
- amount is always positive number (no sign)

DESCRIPTION: combine รายการ + รายละเอียด columns. Skip ช่องทาง, ยอดเงินคงเหลือ.

Start output with [ and end with ]. Nothing else.`
        }
      ]
    }]
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  // Strip markdown fences if present
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  // Extract JSON array
  const match = clean.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`Claude ไม่ส่งข้อมูลกลับมา (raw: ${raw.slice(0, 200)})`)
  try {
    const parsed = JSON.parse(match[0]) as StatementEntry[]
    return parsed.filter(e => e.date && typeof e.amount === 'number' && e.amount > 0 && (e.type === 'in' || e.type === 'out'))
  } catch (e) {
    throw new Error(`แปลง JSON ไม่ได้: ${e instanceof Error ? e.message : e} | raw: ${raw.slice(0, 200)}`)
  }
}

// Parse CSV (handles TTB single signed-amount column and standard credit/debit columns)
function parseCsv(text: string): StatementEntry[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const entries: StatementEntry[] = []

  // Thai month map for date parsing
  const thaiMonths: Record<string, string> = {
    'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03', 'เม.ย.': '04', 'พ.ค.': '05', 'มิ.ย.': '06',
    'ก.ค.': '07', 'ส.ค.': '08', 'ก.ย.': '09', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12'
  }

  function parseDate(s: string): string | null {
    if (!s) return null
    s = s.trim()
    // Thai date: "9 มิ.ย. 69"
    for (const [mon, num] of Object.entries(thaiMonths)) {
      const re = new RegExp(`(\\d{1,2})\\s*${mon.replace(/\./g, '\\.')}\\s*(\\d{2,4})`)
      const m = s.match(re)
      if (m) {
        let y = parseInt(m[2])
        if (y < 100) y += 2500
        if (y > 2400) y -= 543
        return `${y}-${num}-${m[1].padStart(2, '0')}`
      }
    }
    // YYYY-MM-DD
    const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m1) { let y = parseInt(m1[1]); if (y > 2400) y -= 543; return `${y}-${m1[2]}-${m1[3]}` }
    // DD/MM/YYYY
    const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (m2) { let y = parseInt(m2[3]); if (y > 2400) y -= 543; return `${y}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}` }
    return null
  }

  function parseCsvRow(line: string): string[] {
    const result: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if ((ch === ',' || ch === '\t') && !inQ) { result.push(cur.trim()); cur = '' }
      else cur += ch
    }
    result.push(cur.trim())
    return result
  }

  // Find header row and column positions
  let dateCol = -1, descCol = -1, creditCol = -1, debitCol = -1, amountCol = -1
  let dataStart = -1

  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const cells = parseCsvRow(lines[i])
    for (let j = 0; j < cells.length; j++) {
      const h = cells[j].toLowerCase().replace(/\s/g, '')
      if (dateCol < 0 && (h === 'วันที่' || h === 'date' || h.includes('วัน'))) dateCol = j
      if (descCol < 0 && (h === 'รายการ' || h === 'description' || h.includes('รายละ'))) descCol = j
      if (creditCol < 0 && (h.includes('ฝาก') || h.includes('เข้า') || h === 'credit')) creditCol = j
      if (debitCol < 0 && (h.includes('ถอน') || h.includes('ออก') || h === 'debit')) debitCol = j
      if (amountCol < 0 && (h === 'จำนวนเงิน' || h === 'amount')) amountCol = j
    }
    if (dateCol >= 0 && (creditCol >= 0 || debitCol >= 0 || amountCol >= 0)) {
      dataStart = i + 1
      break
    }
  }

  // Fallback: scan for first row with a parseable date
  if (dataStart < 0) {
    for (let i = 0; i < lines.length; i++) {
      const cells = parseCsvRow(lines[i])
      if (cells.length >= 3 && parseDate(cells[0])) {
        dataStart = i; dateCol = 0; descCol = 1
        // Detect signed amount
        const hasSign = cells.some(c => /^[+\-][\d,]+\.\d{2}$/.test(c.trim()))
        if (hasSign) amountCol = cells.findIndex(c => /^[+\-][\d,]+\.\d{2}$/.test(c.trim()))
        else { creditCol = 2; debitCol = 3 }
        break
      }
    }
  }

  // Auto-detect signed-amount column from first data row if not found yet
  if (amountCol < 0 && creditCol < 0 && dataStart >= 0 && dataStart < lines.length) {
    const cells = parseCsvRow(lines[dataStart])
    for (let j = 0; j < cells.length; j++) {
      if (/^[+\-][\d,]+\.\d{2}$/.test(cells[j].trim())) { amountCol = j; break }
    }
  }

  if (dataStart < 0) return []

  for (let i = dataStart; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i])
    if (cells.length < 2) continue
    const date = parseDate(dateCol >= 0 ? cells[dateCol] : cells[0])
    if (!date) continue
    const desc = (descCol >= 0 && descCol < cells.length ? cells[descCol] : '').trim()

    if (amountCol >= 0 && amountCol < cells.length) {
      const val = parseFloat(cells[amountCol].replace(/,/g, ''))
      if (!isNaN(val) && val !== 0) {
        entries.push({ date, description: desc, amount: Math.abs(val), type: val > 0 ? 'in' : 'out' })
      }
    } else {
      const credit = creditCol >= 0 && creditCol < cells.length ? parseFloat(cells[creditCol].replace(/,/g, '')) || 0 : 0
      const debit  = debitCol  >= 0 && debitCol  < cells.length ? parseFloat(cells[debitCol].replace(/,/g, ''))  || 0 : 0
      if (credit > 0) entries.push({ date, description: desc, amount: credit, type: 'in' })
      if (debit  > 0) entries.push({ date, description: desc, amount: debit,  type: 'out' })
    }
  }

  return entries
}

// Get system transactions for a bank in a date range
async function getSystemEntries(supabase: Awaited<ReturnType<typeof createClient>>, bankName: string, startDate: string, endDate: string): Promise<SystemEntry[]> {

  const entries: SystemEntry[] = []

  // Expenses (money out from this bank)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, date, amount_satang, category, note, payment_method, sender_bank, sender_account, recipient_name')
    .eq('is_deleted', false)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  for (const e of expenses || []) {
    if (!bankName || bankMatches(e.sender_bank, bankName) ||
        (e.payment_method === 'cash' && bankName.toLowerCase().includes('สด'))) {
      const desc = e.category + (e.recipient_name ? ` — ${e.recipient_name}` : '') + (e.note ? ` (${e.note})` : '')
      entries.push({ date: e.date, description: desc, amount: e.amount_satang / 100, type: 'out', source: 'expense', id: e.id })
    }
  }

  // Daily sales (money in — electronic payments → income bank)
  const { data: sales } = await supabase
    .from('daily_sales')
    .select('date, promptpay_satang, company_transfer_satang, credit_card_satang, papaya_promptpay_satang, papaya_company_transfer_satang, papaya_credit_card_satang, cash_satang, papaya_cash_satang')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  for (const s of sales || []) {
    const electronic = (
      (s.promptpay_satang || 0) + (s.company_transfer_satang || 0) + (s.credit_card_satang || 0) +
      (s.papaya_promptpay_satang || 0) + (s.papaya_company_transfer_satang || 0) + (s.papaya_credit_card_satang || 0)
    ) / 100
    const cash = ((s.cash_satang || 0) + (s.papaya_cash_satang || 0)) / 100

    if (electronic > 0) {
      entries.push({ date: s.date, description: 'รายได้ยอดขาย (โอน/พร้อมเพย์/บัตร)', amount: electronic, type: 'in', source: 'sales' })
    }
    if (cash > 0 && (!bankName || bankName.toLowerCase().includes('สด'))) {
      entries.push({ date: s.date, description: 'รายได้ยอดขาย (เงินสด)', amount: cash, type: 'in', source: 'sales_cash' })
    }
  }

  // Bank transfers
  const { data: transfers } = await supabase
    .from('bank_transfers')
    .select('id, date, amount_satang, from_bank, from_account, to_bank, to_account, note')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  for (const t of transfers || []) {
    const fromMatch = !bankName || bankMatches(t.from_bank, bankName)
    const toMatch   = !bankName || bankMatches(t.to_bank, bankName)
    if (fromMatch) {
      entries.push({
        date: t.date,
        description: `โอนออกไป ${t.to_bank}${t.to_account ? ' ' + t.to_account : ''}${t.note ? ' — ' + t.note : ''}`,
        amount: t.amount_satang / 100,
        type: 'out',
        source: 'transfer',
        id: t.id,
      })
    }
    if (toMatch) {
      entries.push({
        date: t.date,
        description: `รับโอนจาก ${t.from_bank}${t.from_account ? ' ' + t.from_account : ''}${t.note ? ' — ' + t.note : ''}`,
        amount: t.amount_satang / 100,
        type: 'in',
        source: 'transfer',
        id: t.id,
      })
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date))
}

// Reconciliation algorithm
function reconcile(statement: StatementEntry[], system: SystemEntry[]) {
  const systemUsed = new Set<number>()
  const matched: MatchItem[] = []
  const statementOnly: StatementEntry[] = []
  const systemOnly: SystemEntry[] = []

  for (const s of statement) {
    let bestJ = -1, bestScore = -1

    for (let j = 0; j < system.length; j++) {
      if (systemUsed.has(j)) continue
      const e = system[j]
      if (Math.abs(s.amount - e.amount) > 1) continue   // amount tolerance: 1 baht
      if (s.type !== e.type) continue
      const dayDiff = Math.abs(daysBetween(s.date, e.date))
      if (dayDiff > 0) continue                         // date must match exactly
      const score = 100 + (Math.abs(s.amount - e.amount) < 0.05 ? 15 : 0)
      if (score > bestScore) { bestScore = score; bestJ = j }
    }

    if (bestJ >= 0) {
      systemUsed.add(bestJ)
      matched.push({
        statement: s,
        system: system[bestJ],
        dayDiff: daysBetween(s.date, system[bestJ].date),
        amountDiff: Math.round((s.amount - system[bestJ].amount) * 100) / 100,
      })
    } else {
      statementOnly.push(s)
    }
  }

  for (let j = 0; j < system.length; j++) {
    if (!systemUsed.has(j)) systemOnly.push(system[j])
  }

  const totalStmIn  = [...statement.filter(e => e.type === 'in')].reduce((s, e) => s + e.amount, 0)
  const totalStmOut = [...statement.filter(e => e.type === 'out')].reduce((s, e) => s + e.amount, 0)
  const totalSysIn  = [...system.filter(e => e.type === 'in')].reduce((s, e) => s + e.amount, 0)
  const totalSysOut = [...system.filter(e => e.type === 'out')].reduce((s, e) => s + e.amount, 0)

  return {
    matched,
    statementOnly,
    systemOnly,
    summary: {
      stmIn: Math.round(totalStmIn * 100) / 100,
      stmOut: Math.round(totalStmOut * 100) / 100,
      sysIn: Math.round(totalSysIn * 100) / 100,
      sysOut: Math.round(totalSysOut * 100) / 100,
      matchedCount: matched.length,
      statementOnlyCount: statementOnly.length,
      systemOnlyCount: systemOnly.length,
    }
  }
}

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const bankName = (formData.get('bank') as string) || ''
  const month = (formData.get('month') as string) || ''
  const dateFromRaw = (formData.get('dateFrom') as string) || ''
  const dateToRaw   = (formData.get('dateTo')   as string) || ''

  if (!file) {
    return NextResponse.json({ error: 'กรุณาส่งไฟล์' }, { status: 400 })
  }

  // Resolve date range
  let startDate: string, endDate: string
  if (dateFromRaw && dateToRaw) {
    startDate = dateFromRaw
    endDate = dateToRaw
  } else if (month) {
    const [y, m] = month.split('-').map(Number)
    startDate = `${month}-01`
    endDate = `${month}-${new Date(y, m, 0).getDate().toString().padStart(2, '0')}`
  } else {
    return NextResponse.json({ error: 'กรุณาระบุเดือนหรือช่วงเวลา' }, { status: 400 })
  }

  try {
    let statementEntries: StatementEntry[]
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      statementEntries = await parsePdfWithClaude(file)
    } else {
      const text = await file.text()
      statementEntries = parseCsv(text)
    }

    if (statementEntries.length === 0) {
      return NextResponse.json({ error: 'ไม่พบข้อมูล Statement — ตรวจสอบว่าไฟล์มีข้อมูลธุรกรรม หรือลอง CSV แทน PDF' }, { status: 400 })
    }

    // Filter statement to selected date range (statements may span multiple months)
    const allCount = statementEntries.length
    statementEntries = statementEntries.filter(e => e.date >= startDate && e.date <= endDate)
    if (statementEntries.length === 0) {
      return NextResponse.json({
        error: `ไม่มีรายการใน Statement สำหรับช่วง ${startDate} ถึง ${endDate} (Statement มี ${allCount} รายการ แต่เป็นช่วงเวลาอื่นทั้งหมด)`
      }, { status: 400 })
    }

    const supabase = await createClient()
    const systemEntries = await getSystemEntries(supabase, bankName, startDate, endDate)
    const result = reconcile(statementEntries, systemEntries)

    return NextResponse.json({ ...result, statementCount: statementEntries.length, systemCount: systemEntries.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
