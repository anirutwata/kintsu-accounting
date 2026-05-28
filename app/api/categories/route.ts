import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'กรุณาใส่ชื่อหมวดหมู่' }, { status: 400 })

  // Get max sort_order
  const { data: last } = await supabase
    .from('expense_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ name: name.trim(), sort_order: (last?.sort_order ?? 0) + 1 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
