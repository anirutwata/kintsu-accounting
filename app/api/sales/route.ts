import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { calcGrabNet } from '@/lib/money'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const date = searchParams.get('date')

  let query = supabase.from('daily_sales').select('*').order('date', { ascending: false })
  if (date) query = query.eq('date', date)
  if (month) query = query.gte('date', `${month}-01`).lte('date', `${month}-31`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value

  const body = await req.json()
  const { date, dine_in, grabfood, takeaway } = body

  if (!date) return NextResponse.json({ error: 'กรุณาระบุวันที่' }, { status: 400 })

  // Fetch current GP rate from settings
  const { data: settings } = await supabase.from('settings').select('grabfood_gp_bps').eq('id', 1).single()
  const gpBps = settings?.grabfood_gp_bps || 3000

  // Calculate GrabFood net revenue
  const grabGross = grabfood?.gross_satang || 0
  const { gpFeeSatang, netSatang: grabNet } = calcGrabNet(grabGross, gpBps)

  const dineRev = dine_in?.revenue_satang || 0
  const takeawayRev = takeaway?.revenue_satang || 0
  const totalGross = dineRev + grabGross + takeawayRev
  const totalNet = dineRev + grabNet + takeawayRev

  const record = {
    id: date,
    date,
    dine_in_revenue_satang: dineRev,
    dine_in_covers: dine_in?.covers || 0,
    dine_in_service_charge_satang: dine_in?.service_charge_satang || 0,
    dine_in_vat_satang: dine_in?.vat_satang || 0,
    grabfood_gross_satang: grabGross,
    grabfood_gp_fee_satang: gpFeeSatang,
    grabfood_net_satang: grabNet,
    grabfood_orders: grabfood?.orders || 0,
    grabfood_vat_satang: grabfood?.vat_satang || 0,
    takeaway_revenue_satang: takeawayRev,
    takeaway_orders: takeaway?.orders || 0,
    takeaway_vat_satang: takeaway?.vat_satang || 0,
    void_count: 0,
    void_total_satang: 0,
    refund_count: 0,
    refund_total_satang: 0,
    total_gross_satang: totalGross,
    total_net_satang: totalNet,
    total_vat_satang: (dine_in?.vat_satang || 0) + (grabfood?.vat_satang || 0) + (takeaway?.vat_satang || 0),
    source: 'manual',
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  }

  const { data, error } = await supabase
    .from('daily_sales')
    .upsert(record, { onConflict: 'id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
