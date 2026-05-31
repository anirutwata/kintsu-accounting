import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function triggerGasSync() {
  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl) fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_assets' }) }).catch(() => {})
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('assets')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  triggerGasSync()
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const { error } = await supabase.from('assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  triggerGasSync()
  return NextResponse.json({ ok: true })
}
