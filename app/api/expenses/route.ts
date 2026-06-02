import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram, buildExpenseMessage } from '@/lib/telegram'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const month = searchParams.get('month')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (date) query = query.eq('date', date)
  if (month) {
    const [y, m] = month.split('-').map(Number)
    const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('date', `${month}-01`).lt('date', nextM)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, total: count, page, limit })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value
  const userName = cookieStore.get('kintsu_acc_name')?.value || 'ไม่ระบุ'

  const body = await req.json()
  const { category, amount_satang, payment_method, bank_account_id,
          transfer_time, sender_name, sender_bank, sender_account,
          recipient_name, slip_image_url, slip_hash, ocr_data,
          receipt_image_urls, note, date } = body

  if (!category || !amount_satang) {
    return NextResponse.json({ error: 'กรุณากรอกหมวดหมู่และจำนวนเงิน' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      date: date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
      category,
      amount_satang,
      vat_satang: 0,
      total_satang: amount_satang,
      payment_method: payment_method || 'เงินสด',
      bank_account_id: bank_account_id || null,
      transfer_time: transfer_time || null,
      sender_name: sender_name || null,
      sender_bank: sender_bank || null,
      sender_account: sender_account || null,
      recipient_name: recipient_name || null,
      is_paid: payment_method !== 'เครดิต',
      slip_image_url: slip_image_url || null,
      slip_hash: slip_hash || null,
      ocr_data: ocr_data || null,
      receipt_image_urls: receipt_image_urls || [],
      note: note || null,
      created_by: null,
      created_by_name: userName,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send Telegram notification (non-blocking)
  sendTelegram(buildExpenseMessage({
    category,
    note: body.note || '',
    totalSatang: amount_satang,
    paymentMethod: body.payment_method || 'เงินสด',
    createdByName: userName,
  }))

  // Push to Google Sheets instantly (non-blocking)
  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl) {
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: data.id,
        date: data.date,
        time: data.transfer_time || '',
        category: data.category,
        amount: data.amount_satang / 100,
        payment_method: data.payment_method,
        bank: data.sender_bank || '',
        account: data.sender_account || '',
        recipient: data.recipient_name || '',
        note: data.note || '',
        recorded_by: data.created_by_name || '',
      }),
    }).catch(() => {})
  }

  return NextResponse.json(data)
}
