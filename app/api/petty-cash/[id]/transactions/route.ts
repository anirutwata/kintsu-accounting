import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('petty_cash_transactions')
    .select('*')
    .eq('petty_cash_id', id)
    .order('time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value
  const userName = cookieStore.get('kintsu_acc_name')?.value || 'ไม่ระบุ'

  const { description, amount_satang, category, receipt_image_url } = await req.json()
  if (!description || !amount_satang) {
    return NextResponse.json({ error: 'กรุณากรอกรายละเอียดและจำนวนเงิน' }, { status: 400 })
  }

  const { data: tx, error } = await supabase
    .from('petty_cash_transactions')
    .insert({
      petty_cash_id: id,
      description,
      amount_satang,
      category: category || 'อื่นๆ',
      receipt_image_url: receipt_image_url || null,
      created_by: userId || null,
      created_by_name: userName,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update total_expenses_satang on parent
  const { data: allTx } = await supabase
    .from('petty_cash_transactions')
    .select('amount_satang')
    .eq('petty_cash_id', id)

  const total = (allTx || []).reduce((s, t) => s + t.amount_satang, 0)
  await supabase.from('petty_cash').update({ total_expenses_satang: total }).eq('id', id)

  return NextResponse.json(tx)
}
