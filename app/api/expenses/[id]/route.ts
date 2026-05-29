import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const cookieStore = await cookies()
  const updaterName = cookieStore.get('kintsu_acc_name')?.value || null

  const body = await req.json()
  const { amount_satang, vat_satang, ...rest } = body

  const updates: Record<string, unknown> = {
    ...rest,
    updated_at: new Date().toISOString(),
    updated_by_name: updaterName,
  }

  if (amount_satang !== undefined) {
    updates.amount_satang = amount_satang
    updates.vat_satang = vat_satang || 0
    updates.total_satang = amount_satang + (vat_satang || 0)
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Soft delete only — never hard delete
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value

  const { data, error } = await supabase
    .from('expenses')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Trigger GAS re-sync (non-blocking)
  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl && data?.date) {
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', month: data.date.slice(0, 7) }),
    }).catch(() => {})
  }

  return NextResponse.json(data)
}
