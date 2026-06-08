import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { calcGrabNet } from '@/lib/money'
import { sendTelegram, buildSalesMessage } from '@/lib/telegram'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const date = searchParams.get('date')

  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabase.from('daily_sales').select('*').order('date', { ascending: false })
  if (date) query = query.eq('date', date)
  else if (from && to) query = query.gte('date', from).lte('date', to)
  else if (month) query = query.gte('date', `${month}-01`).lte('date', `${month}-31`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value

  const body = await req.json()
  const { date, foodstory, papaya, grabfood, takeaway } = body

  if (!date) return NextResponse.json({ error: 'กรุณาระบุวันที่' }, { status: 400 })

  // Check if record exists (for update vs new notification)
  const { data: existing } = await supabase.from('daily_sales').select('id').eq('id', date).maybeSingle()
  const isUpdate = !!existing

  // Fetch current GP rate from settings
  const { data: settings } = await supabase.from('settings').select('grabfood_gp_bps').eq('id', 1).single()
  const gpBps = settings?.grabfood_gp_bps || 3000

  // Calculate GrabFood net revenue
  const grabGross = grabfood?.gross_satang || 0
  const { gpFeeSatang, netSatang: grabNet } = calcGrabNet(grabGross, gpBps)

  const foodstoryRev = foodstory?.revenue_satang || 0
  const papayaRev = papaya?.revenue_satang || 0
  const takeawayRev = takeaway?.revenue_satang || 0
  const totalGross = foodstoryRev + papayaRev + grabGross + takeawayRev
  const totalNet = foodstoryRev + papayaRev + grabNet + takeawayRev

  const record = {
    id: date,
    date,
    // Foodstory POS
    dine_in_revenue_satang: foodstoryRev,
    dine_in_covers: foodstory?.covers || 0,
    dine_in_bills: foodstory?.bills || 0,
    dine_in_service_charge_satang: 0,
    dine_in_vat_satang: foodstory?.vat_satang || 0,
    sales_before_vat_satang: foodstory?.sales_before_vat_satang || 0,
    vat_amount_satang: foodstory?.vat_satang || 0,
    rounding_satang: foodstory?.rounding_satang || 0,
    discount_satang: foodstory?.discount_satang || 0,
    cash_satang: foodstory?.cash_satang || 0,
    promptpay_satang: foodstory?.promptpay_satang || 0,
    company_transfer_satang: foodstory?.company_transfer_satang || 0,
    credit_card_satang: foodstory?.credit_card_satang || 0,
    // Papaya POS
    papaya_revenue_satang: papayaRev,
    papaya_covers: papaya?.covers || 0,
    papaya_bills: papaya?.bills || 0,
    papaya_sales_before_vat_satang: papaya?.sales_before_vat_satang || 0,
    papaya_vat_satang: papaya?.vat_satang || 0,
    papaya_rounding_satang: papaya?.rounding_satang || 0,
    papaya_discount_satang: papaya?.discount_satang || 0,
    papaya_cash_satang: papaya?.cash_satang || 0,
    papaya_promptpay_satang: papaya?.promptpay_satang || 0,
    papaya_company_transfer_satang: papaya?.company_transfer_satang || 0,
    papaya_credit_card_satang: papaya?.credit_card_satang || 0,
    // GrabFood
    grabfood_gross_satang: grabGross,
    grabfood_gp_fee_satang: gpFeeSatang,
    grabfood_net_satang: grabNet,
    grabfood_orders: grabfood?.orders || 0,
    grabfood_vat_satang: grabfood?.vat_satang || 0,
    // Takeaway
    takeaway_revenue_satang: takeawayRev,
    takeaway_orders: takeaway?.orders || 0,
    takeaway_vat_satang: takeaway?.vat_satang || 0,
    void_count: 0,
    void_total_satang: 0,
    refund_count: 0,
    refund_total_satang: 0,
    total_gross_satang: totalGross,
    total_net_satang: totalNet,
    total_vat_satang: (foodstory?.vat_satang || 0) + (papaya?.vat_satang || 0) + (grabfood?.vat_satang || 0),
    source: 'manual',
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('daily_sales')
    .upsert(record, { onConflict: 'id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl) {
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: date.substring(0, 7) }),
    }).catch(() => {})
  }

  // Sync Ledger (non-blocking)
  const ledgerUrl = process.env.LEDGER_WEBHOOK_URL
  if (ledgerUrl) {
    fetch(ledgerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: date.substring(0, 7) }),
    }).catch(() => {})
  }

  sendTelegram(buildSalesMessage({
    date,
    isUpdate,
    totalNetSatang: totalNet,
    foodstoryRev,
    papayaRev,
    grabNetSatang: grabNet,
    takeawayRev,
  }))

  return NextResponse.json(data)
}
