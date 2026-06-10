import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  const { code, name, type, parent_code, note } = body
  if (!code || !name || !type) {
    return NextResponse.json({ error: 'กรุณากรอกรหัส ชื่อ และประเภทบัญชี' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('accounts')
    .insert({ code: code.trim(), name: name.trim(), type, parent_code: parent_code || null, note: note || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
