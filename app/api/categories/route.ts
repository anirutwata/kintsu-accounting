import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all') === 'true'
  const type = searchParams.get('type') // 'expense' | 'asset'
  let query = supabase.from('expense_categories').select('*').order('sort_order').order('name')
  if (!all) query = query.eq('is_active', true)
  if (type) query = query.eq('category_type', type)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [], {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { name, category_type } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'กรุณาใส่ชื่อหมวดหมู่' }, { status: 400 })

  const { data: last } = await supabase
    .from('expense_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ name: name.trim(), sort_order: (last?.sort_order ?? 0) + 1, category_type: category_type || 'expense' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
