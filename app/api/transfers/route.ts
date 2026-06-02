import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram, buildTransferMessage } from '@/lib/telegram'

function triggerGasSync(month: string) {
  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl) fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) }).catch(() => {})
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  let query = supabase.from('bank_transfers').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })
  if (month) {
    const [y, m] = month.split('-').map(Number)
    const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('date', `${month}-01`).lt('date', nextM)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userName = cookieStore.get('kintsu_acc_name')?.value || ''

  const body = await req.json()
  const { date, amount_satang, from_bank, from_account, to_bank, to_account, note } = body

  if (!date || !amount_satang || !from_bank || !to_bank) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bank_transfers')
    .insert({
      date,
      amount_satang: Math.round(amount_satang),
      from_bank,
      from_account: from_account || null,
      to_bank,
      to_account: to_account || null,
      note: note?.trim() || null,
      created_by_name: userName,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  triggerGasSync(date.substring(0, 7))
  sendTelegram(buildTransferMessage({
    date,
    amountSatang: data.amount_satang,
    fromBank: data.from_bank,
    fromAccount: data.from_account,
    toBank: data.to_bank,
    toAccount: data.to_account,
    note: data.note,
    isDelete: false,
  }))

  return NextResponse.json(data)
}
