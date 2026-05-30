import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('purchase_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  const { name, category, purchase_date, purchase_satang, salvage_satang, useful_life_months, description } = body

  if (!name?.trim() || !category || !purchase_date || !purchase_satang) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      name: name.trim(),
      category,
      purchase_date,
      purchase_satang: Math.round(purchase_satang),
      salvage_satang: Math.round(salvage_satang || 0),
      useful_life_months: Math.round(useful_life_months || 60),
      description: description?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
