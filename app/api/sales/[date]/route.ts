import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram, buildSalesDeleteMessage } from '@/lib/telegram'

export async function DELETE(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const supabase = await createClient()
  const { date } = await params

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const { error } = await supabase.from('daily_sales').delete().eq('id', date)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  sendTelegram(buildSalesDeleteMessage(date))
  return NextResponse.json({ ok: true })
}
