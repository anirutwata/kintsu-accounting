import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function PUT(req: Request) {
  const supabase = createAdminClient()
  const body = await req.json()
  const { error } = await supabase
    .from('settings')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
