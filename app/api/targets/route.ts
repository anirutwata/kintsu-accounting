import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_targets')
    .select('*')
    .order('id', { ascending: false })
    .limit(12)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  const { month, revenue_target_satang, food_cost_target_bps, labor_cost_target_bps, net_profit_target_bps } = body
  if (!month) return NextResponse.json({ error: 'กรุณาระบุเดือน' }, { status: 400 })

  const { data, error } = await supabase
    .from('monthly_targets')
    .upsert({
      id: month,
      revenue_target_satang: Math.round(revenue_target_satang || 0),
      food_cost_target_bps: Math.round(food_cost_target_bps || 0),
      labor_cost_target_bps: Math.round(labor_cost_target_bps || 0),
      net_profit_target_bps: Math.round(net_profit_target_bps || 0),
    }, { onConflict: 'id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
