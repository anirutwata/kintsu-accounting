import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcGrabNet } from '@/lib/money'

// POST /api/sales/import?key=EXPORT_API_KEY
// Body: {
//   date: 'YYYY-MM-DD',
//   dine_in_revenue: number,       // Total Sales (after VAT)
//   dine_in_covers: number,
//   sales_before_vat: number,      // Sales before VAT
//   vat_amount: number,            // VAT amount
//   rounding: number,              // Total Rounding
//   cash: number,                  // Cash payment
//   card: number,                  // Card/Transfer payment
// }
// Only updates dine_in + payment fields — preserves GrabFood / Takeaway
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('key') !== process.env.EXPORT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    date,
    dine_in_revenue,
    dine_in_covers,
    sales_before_vat,
    vat_amount,
    rounding,
    cash,
    card,
  } = body

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date. Use YYYY-MM-DD' }, { status: 400 })
  }
  if (dine_in_revenue === undefined || dine_in_revenue === null) {
    return NextResponse.json({ error: 'Missing dine_in_revenue' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('daily_sales').select('*').eq('date', date).single()

  const { data: settings } = await supabase
    .from('settings').select('grabfood_gp_bps').eq('id', 1).single()
  const gpBps = settings?.grabfood_gp_bps ?? 3000

  const dineRevSatang = Math.round(dine_in_revenue * 100)
  const grabGross = existing?.grabfood_gross_satang ?? 0
  const { gpFeeSatang, netSatang: grabNet } = calcGrabNet(grabGross, gpBps)
  const takeawayRev = existing?.takeaway_revenue_satang ?? 0

  const record = {
    id: date,
    date,
    dine_in_revenue_satang: dineRevSatang,
    dine_in_covers: dine_in_covers ?? existing?.dine_in_covers ?? 0,
    dine_in_service_charge_satang: existing?.dine_in_service_charge_satang ?? 0,
    dine_in_vat_satang: Math.round((vat_amount ?? 0) * 100),
    grabfood_gross_satang: grabGross,
    grabfood_gp_fee_satang: gpFeeSatang,
    grabfood_net_satang: grabNet,
    grabfood_orders: existing?.grabfood_orders ?? 0,
    grabfood_vat_satang: existing?.grabfood_vat_satang ?? 0,
    takeaway_revenue_satang: takeawayRev,
    takeaway_orders: existing?.takeaway_orders ?? 0,
    takeaway_vat_satang: existing?.takeaway_vat_satang ?? 0,
    void_count: 0,
    void_total_satang: 0,
    refund_count: 0,
    refund_total_satang: 0,
    total_gross_satang: dineRevSatang + grabGross + takeawayRev,
    total_net_satang: dineRevSatang + grabNet + takeawayRev,
    total_vat_satang: Math.round((vat_amount ?? 0) * 100),
    // Payment breakdown & VAT detail
    sales_before_vat_satang: Math.round((sales_before_vat ?? 0) * 100),
    vat_amount_satang: Math.round((vat_amount ?? 0) * 100),
    rounding_satang: Math.round((rounding ?? 0) * 100),
    cash_satang: Math.round((cash ?? 0) * 100),
    card_satang: Math.round((card ?? 0) * 100),
    source: 'foodstory',
    updated_at: new Date().toISOString(),
    updated_by: null,
  }

  const { data, error } = await supabase
    .from('daily_sales')
    .upsert(record, { onConflict: 'id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
