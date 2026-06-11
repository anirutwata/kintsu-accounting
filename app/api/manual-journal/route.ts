import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || ''
  if (!month) return NextResponse.json([], { status: 200 })

  const [y, m] = month.split('-').map(Number)
  const startDate = `${month}-01`
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('manual_journal_entries')
    .select('*')
    .is('deleted_at', null)
    .gte('date', startDate)
    .lt('date', nextMonth)
    .order('date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { date, description, reference, debit_code, debit_name, credit_code, credit_name, amount_satang } = body

  if (!date || !description || !debit_code || !credit_code || !amount_satang) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }
  if (debit_code === credit_code) {
    return NextResponse.json({ error: 'บัญชีเดบิตและเครดิตต้องไม่ซ้ำกัน' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('manual_journal_entries')
    .insert({ date, description, reference: reference || '', debit_code, debit_name, credit_code, credit_name, amount_satang })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
