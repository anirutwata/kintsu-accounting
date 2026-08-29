import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncKusolaJournal, type KusolaJournalLine } from '@/lib/kusolaGeneralJournal'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('kusola_general_journals').select('*, kusola_general_journal_lines(*)').eq('company_key', 'kusola').order('document_date', { ascending: false })
  if (error) return NextResponse.json({ error: 'โหลดรายการ JV ไม่สำเร็จ' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json() as { date?: string; description?: string; reference?: string; remarks?: string; note?: string; contactName?: string; lines?: KusolaJournalLine[] }
  if (!body.date || !body.description?.trim() || !Array.isArray(body.lines) || body.lines.length < 2) return NextResponse.json({ error: 'กรุณากรอกข้อมูลและรายการบัญชีให้ครบ' }, { status: 400 })
  const debit = body.lines.filter(line => line.debitCredit === 'debit').reduce((sum, line) => sum + Number(line.amountSatang), 0)
  const credit = body.lines.filter(line => line.debitCredit === 'credit').reduce((sum, line) => sum + Number(line.amountSatang), 0)
  if (!Number.isSafeInteger(debit) || debit <= 0 || debit !== credit) return NextResponse.json({ error: 'ยอดเดบิตและเครดิตต้องเท่ากัน' }, { status: 400 })
  const supabase = await createClient()
  const { data: journal, error } = await supabase.from('kusola_general_journals').insert({ company_key: 'kusola', document_date: body.date, description: body.description.trim(), reference: body.reference?.trim() ?? '', remarks: body.remarks?.trim() ?? '', note: body.note?.trim() ?? '', contact_name: body.contactName?.trim() || 'KINTSU Accounting', status: 'syncing' }).select().single()
  if (error || !journal) return NextResponse.json({ error: 'สร้างรายการ JV ไม่สำเร็จ' }, { status: 500 })
  const lines = body.lines.map((line, index) => ({ journal_id: journal.id, line_no: index + 1, debit_credit: line.debitCredit, flowaccount_account_id: line.chartOfAccountId, account_code: line.accountCode, account_name: line.accountName, amount_satang: line.amountSatang, description: line.description?.trim() ?? '' }))
  const lineResult = await supabase.from('kusola_general_journal_lines').insert(lines)
  if (lineResult.error) return NextResponse.json({ error: 'บันทึกรายการบัญชีไม่สำเร็จ' }, { status: 500 })
  try {
    const result = await syncKusolaJournal({ id: journal.id, date: body.date, description: body.description, reference: body.reference ?? '', remarks: body.remarks ?? '', note: body.note ?? '', contactName: body.contactName ?? '', lines: body.lines })
    const { data: synced } = await supabase.from('kusola_general_journals').update({ status: 'synced', flowaccount_record_id: result.recordId, flowaccount_document_serial: result.documentSerial, flowaccount_synced_at: new Date().toISOString(), sync_error: null }).eq('id', journal.id).select().single()
    return NextResponse.json(synced ?? journal, { status: 201 })
  } catch (error) {
    await supabase.from('kusola_general_journals').update({ status: 'error', sync_error: error instanceof Error ? error.message.slice(0, 500) : 'FlowAccount sync failed' }).eq('id', journal.id)
    return NextResponse.json({ error: 'บันทึกใน FlowAccount ไม่สำเร็จ รายการถูกเก็บไว้ให้ตรวจสอบ' }, { status: 502 })
  }
}
