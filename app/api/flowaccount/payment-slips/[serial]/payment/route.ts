import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

interface PaymentBody {
  payment_date?: string
  bank_account_id?: string
  amount_satang?: number
  slip_image_url?: string
  note?: string
}

export async function POST(req: Request, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params
  if (!/^PAY\d+$/i.test(serial)) {
    return NextResponse.json({ error: 'เลขใบเตรียมจ่ายไม่ถูกต้อง' }, { status: 400 })
  }

  const cookieStore = await cookies()
  if (!cookieStore.get('kintsu_acc_user_id')?.value) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })
  }

  const body = await req.json() as PaymentBody
  const { payment_date, bank_account_id, amount_satang, slip_image_url, note } = body
  if (!payment_date || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
    return NextResponse.json({ error: 'กรุณาระบุวันที่ชำระ' }, { status: 400 })
  }
  if (!bank_account_id || !Number.isSafeInteger(amount_satang) || amount_satang! <= 0 || !slip_image_url) {
    return NextResponse.json({ error: 'กรุณาระบุบัญชี ยอดโอน และแนบสลิปให้ครบ' }, { status: 400 })
  }

  const supabase = await createClient()
  const [{ data: expenses, error: expensesError }, { data: bank, error: bankError }] = await Promise.all([
    supabase
      .from('expenses')
      .select('total_satang, wht_satang, flowaccount_payment_status')
      .eq('flowaccount_payment_slip_serial', serial)
      .eq('source', 'flowaccount_payment_slip')
      .eq('is_deleted', false),
    supabase.from('bank_accounts').select('id').eq('id', bank_account_id).eq('is_active', true).maybeSingle(),
  ])
  if (expensesError) return NextResponse.json({ error: expensesError.message }, { status: 500 })
  if (bankError || !bank) return NextResponse.json({ error: 'ไม่พบบัญชีธนาคารที่เลือก' }, { status: 400 })
  if (!expenses?.length) return NextResponse.json({ error: 'ไม่พบใบเตรียมจ่ายนี้' }, { status: 404 })
  if (expenses.some(expense => expense.flowaccount_payment_status !== 'pendingPayment')) {
    return NextResponse.json({ error: 'สถานะใบเตรียมจ่ายเปลี่ยนแล้ว กรุณา Sync ก่อนบันทึก' }, { status: 409 })
  }

  const expectedAmountSatang = expenses.reduce(
    (sum, expense) => sum + Number(expense.total_satang) - Number(expense.wht_satang || 0),
    0,
  )
  const payment = {
    payment_date,
    bank_account_id,
    amount_satang,
    slip_image_url,
    note: note?.trim() || null,
    recorded_by_name: cookieStore.get('kintsu_acc_name')?.value || 'ไม่ระบุ',
    updated_at: new Date().toISOString(),
  }

  const { data: existing, error: existingError } = await supabase
    .from('payment_slip_local_payments')
    .select('id')
    .eq('payment_slip_serial', serial)
    .eq('is_deleted', false)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const query = existing
    ? supabase.from('payment_slip_local_payments').update(payment).eq('id', existing.id)
    : supabase.from('payment_slip_local_payments').insert({ payment_slip_serial: serial, ...payment })
  const { data, error } = await query.select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, expected_amount_satang: expectedAmountSatang })
}
