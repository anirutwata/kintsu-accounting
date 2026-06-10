import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const [{ data: accounts, error }, { data: banks }] = await Promise.all([
    supabase.from('accounts').select('*').not('code', 'ilike', '11%').order('code'),
    supabase.from('bank_accounts').select('*').eq('is_active', true).order('sort_order'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate 11xx bank entries: sequential codes by sort_order (1102, 1103, ...)
  const bankEntries = [
    { id: 'auto-1101', code: '1101', name: 'เงินสด', type: 'asset', is_active: true, auto: true },
    ...(banks || []).map((ba, i) => ({
      id: `auto-${ba.id}`,
      code: String(1102 + i),
      name: `${ba.bank_name} ${ba.account_number} (${ba.account_name})`,
      type: 'asset',
      is_active: ba.is_active,
      auto: true,
    })),
  ]

  const all = [...bankEntries, ...(accounts || [])].sort((a, b) => a.code.localeCompare(b.code))
  return NextResponse.json(all)
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
