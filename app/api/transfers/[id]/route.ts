import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram, buildTransferMessage } from '@/lib/telegram'

function triggerGasSync(month: string) {
  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl) fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) }).catch(() => {})
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const { data: transfer } = await supabase.from('bank_transfers').select('*').eq('id', id).single()
  const { error } = await supabase.from('bank_transfers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (transfer) {
    triggerGasSync(transfer.date.substring(0, 7))
    sendTelegram(buildTransferMessage({
      date: transfer.date,
      amountSatang: transfer.amount_satang,
      fromBank: transfer.from_bank,
      fromAccount: transfer.from_account,
      toBank: transfer.to_bank,
      toAccount: transfer.to_account,
      note: transfer.note,
      isDelete: true,
    }))
  }

  return NextResponse.json({ ok: true })
}
