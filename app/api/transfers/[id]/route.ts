import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram, buildTransferMessage } from '@/lib/telegram'
import { syncBankTransferToFlowAccount, voidBankTransferJournal } from '@/lib/bankTransferSync'

function triggerGasSync(month: string) {
  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl) fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) }).catch(() => {})
  const ledgerUrl = process.env.LEDGER_WEBHOOK_URL
  if (ledgerUrl) fetch(ledgerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) }).catch(() => {})
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()
  const { date, amount_satang, from_bank, from_account, to_bank, to_account, note, slip_image_url } = body

  const { data: existing } = await supabase
    .from('bank_transfers')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'ไม่พบรายการโอนเงิน' }, { status: 404 })

  if (existing.flowaccount_journal_record_id && existing.flowaccount_journal_state !== 'void_pending') {
    const { data: pending, error: pendingError } = await supabase.from('bank_transfers').update({
      flowaccount_journal_state: 'voiding',
      flowaccount_sync_error: 'กำลัง Void JV เดิมเพื่อบันทึกการแก้ไข',
    }).eq('id', id).eq('flowaccount_journal_state', 'synced').select('id').maybeSingle()
    if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })
    if (!pending) return NextResponse.json({ error: 'รายการนี้กำลังถูกแก้ไข กรุณาลองใหม่อีกครั้ง' }, { status: 409 })

    const voidResult = await voidBankTransferJournal(existing.flowaccount_journal_record_id)
    if (!voidResult.ok) {
      await supabase.from('bank_transfers').update({ flowaccount_journal_state: 'synced', flowaccount_sync_error: null }).eq('id', id)
      return NextResponse.json({ error: `ยังไม่แก้ไขรายการ เพราะยกเลิก ${existing.flowaccount_journal_serial} ใน FlowAccount ไม่สำเร็จ: ${voidResult.error}` }, { status: 502 })
    }
    const { error: voidedStateError } = await supabase.from('bank_transfers').update({
      flowaccount_journal_state: 'void_pending',
      flowaccount_sync_error: 'JV เดิมถูก Void แล้ว รอบันทึกข้อมูลใหม่',
    }).eq('id', id).eq('flowaccount_journal_state', 'voiding')
    if (voidedStateError) return NextResponse.json({ error: `JV เดิมถูก Void แล้ว แต่บันทึกสถานะ KINTSU ไม่สำเร็จ: ${voidedStateError.message}` }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('bank_transfers')
    .update({
      date,
      amount_satang: Math.round(amount_satang),
      from_bank,
      from_account: from_account || null,
      to_bank,
      to_account: to_account || null,
      note: note?.trim() || null,
      slip_image_url: slip_image_url || null,
      flowaccount_journal_record_id: null,
      flowaccount_journal_serial: null,
      flowaccount_journal_state: 'idle',
      flowaccount_synced_at: null,
      flowaccount_sync_error: null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  triggerGasSync(data.date.substring(0, 7))
  const syncResult = await syncBankTransferToFlowAccount(supabase, data.id)
  if (!syncResult.ok) return NextResponse.json({ ...data, flowaccount_sync_error: syncResult.error })
  return NextResponse.json({
    ...data,
    flowaccount_journal_record_id: syncResult.recordId,
    flowaccount_journal_serial: syncResult.documentSerial,
    flowaccount_sync_error: null,
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const { data: transfer } = await supabase.from('bank_transfers').select('*').eq('id', id).eq('is_deleted', false).maybeSingle()
  if (!transfer) return NextResponse.json({ error: 'ไม่พบรายการโอนเงิน' }, { status: 404 })

  if (transfer.flowaccount_journal_record_id && transfer.flowaccount_journal_state !== 'void_pending') {
    const { data: pending, error: pendingError } = await supabase.from('bank_transfers').update({
      flowaccount_journal_state: 'voiding',
      flowaccount_sync_error: 'กำลัง Void JV ก่อนลบรายการ',
    }).eq('id', id).eq('flowaccount_journal_state', 'synced').select('id').maybeSingle()
    if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })
    if (!pending) return NextResponse.json({ error: 'รายการนี้กำลังถูกลบ กรุณาลองใหม่อีกครั้ง' }, { status: 409 })

    const voidResult = await voidBankTransferJournal(transfer.flowaccount_journal_record_id)
    if (!voidResult.ok) {
      await supabase.from('bank_transfers').update({ flowaccount_journal_state: 'synced', flowaccount_sync_error: null }).eq('id', id)
      return NextResponse.json({ error: `ยังไม่ลบรายการ เพราะยกเลิก ${transfer.flowaccount_journal_serial} ใน FlowAccount ไม่สำเร็จ: ${voidResult.error}` }, { status: 502 })
    }
    const { error: voidedStateError } = await supabase.from('bank_transfers').update({
      flowaccount_journal_state: 'void_pending',
      flowaccount_sync_error: 'JV เดิมถูก Void แล้ว รอ soft-delete รายการ',
    }).eq('id', id).eq('flowaccount_journal_state', 'voiding')
    if (voidedStateError) return NextResponse.json({ error: `JV เดิมถูก Void แล้ว แต่บันทึกสถานะ KINTSU ไม่สำเร็จ: ${voidedStateError.message}` }, { status: 500 })
  }

  const { error } = await supabase.from('bank_transfers').update({
    is_deleted: true,
    deleted_at: new Date().toISOString(),
  }).eq('id', id).eq('is_deleted', false)
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
    }), 'transfers')
  }

  return NextResponse.json({ ok: true })
}
