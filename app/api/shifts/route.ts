import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTodayBKK } from '@/lib/utils'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || getTodayBKK()

  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('date', date)
    .order('opened_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value
  const { shift_name, float_satang } = await req.json()

  if (!shift_name) return NextResponse.json({ error: 'กรุณาระบุชื่อกะ' }, { status: 400 })

  // Check no open shift exists today
  const today = getTodayBKK()
  const { data: open } = await supabase
    .from('shifts')
    .select('id')
    .eq('date', today)
    .eq('status', 'open')
    .maybeSingle()

  if (open) return NextResponse.json({ error: 'มีกะที่เปิดอยู่แล้ว กรุณาปิดกะก่อน' }, { status: 400 })

  const { data, error } = await supabase
    .from('shifts')
    .insert({
      date: today,
      shift_name,
      float_satang: float_satang || 0,
      status: 'open',
      opened_by: userId || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
