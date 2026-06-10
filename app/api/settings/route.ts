import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  const { error } = await supabase
    .from('settings')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Re-fetch to return updated record
  const { data, error: fetchError } = await supabase.from('settings').select('*').eq('id', 1).single()
  if (fetchError) return NextResponse.json({ ok: true })
  return NextResponse.json(data)
}
