import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const shiftId = searchParams.get('shift_id')

  let query = supabase.from('petty_cash').select('*').order('created_at', { ascending: false })
  if (shiftId) query = query.eq('shift_id', shiftId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value

  const { shift_id, opening_balance_satang } = await req.json()
  if (!shift_id) return NextResponse.json({ error: 'กรุณาระบุกะ' }, { status: 400 })

  // Check shift exists
  const { data: shift } = await supabase.from('shifts').select('date').eq('id', shift_id).single()
  if (!shift) return NextResponse.json({ error: 'ไม่พบกะ' }, { status: 404 })

  const { data, error } = await supabase
    .from('petty_cash')
    .insert({
      shift_id,
      date: shift.date,
      opening_balance_satang: opening_balance_satang || 0,
      status: 'open',
      opened_by: userId || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
