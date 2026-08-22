import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram } from '@/lib/telegram'
import { updateFlowAccountSync, deleteFlowAccountSync } from '@/lib/expenseSync'

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
    // amount_satang is the total actually paid (matches the receipt's grand total);
    // vat_satang is how much of that total is VAT, not an add-on — total_satang
    // never changes based on VAT, only how it's later reported to FlowAccount.
    updates.amount_satang = amount_satang
    updates.vat_satang = vat_satang || 0
    updates.total_satang = amount_satang
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Propagate the edit to FlowAccount too, if this expense was already synced —
  // otherwise the two would silently drift apart. A failure here doesn't fail the
  // local edit (already saved above); staff are alerted to reconcile manually.
  if (data.flowaccount_record_id) {
    const syncResult = await updateFlowAccountSync(supabase, id)
    if (syncResult.ok) {
      data.flowaccount_synced_at = new Date().toISOString()
    } else {
      sendTelegram(
        `⚠️ แก้ไขรายจ่าย "${data.category}" แล้ว แต่อัปเดต FlowAccount (${data.flowaccount_document_serial}) ไม่สำเร็จ: ${syncResult.error}\nต้องแก้ไขในระบบ FlowAccount ด้วยตัวเองให้ตรงกัน`,
        'expenses',
      )
    }
  }

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

  // Telegram notification
  if (data) {
    const docDate = data.document_date || data.date
    sendTelegram(`🗑️ <b>ลบรายจ่าย</b>\n📁 ${data.category}${data.note ? ` — ${data.note}` : ''}\n💰 ฿${(data.amount_satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })}\n📅 ${docDate}`, 'expenses')
  }

  // Delete the FlowAccount document too, if this expense was already synced — otherwise
  // it would keep showing up in FlowAccount forever with no trace it was ever removed
  // here. A failure doesn't undo the local delete (already soft-deleted above); staff
  // are alerted to void/delete it manually in FlowAccount instead.
  if (data?.flowaccount_record_id) {
    const delResult = await deleteFlowAccountSync(data.flowaccount_record_id)
    if (!delResult.ok) {
      sendTelegram(
        `⚠️ ลบรายจ่าย "${data.category}" แล้ว แต่ลบเอกสาร FlowAccount (${data.flowaccount_document_serial}) ไม่สำเร็จ: ${delResult.error}\nต้องลบ/void ในระบบ FlowAccount ด้วยตัวเอง`,
        'expenses',
      )
    }
  }

  // Trigger GAS re-sync (non-blocking) — use document_date for P&L month
  const gasUrl = process.env.GAS_WEBHOOK_URL
  const docDateForSync = data?.document_date || data?.date
  if (gasUrl && docDateForSync) {
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', month: docDateForSync.slice(0, 7) }),
    }).catch(() => {})
  }

  // Sync Ledger (non-blocking)
  const ledgerUrl = process.env.LEDGER_WEBHOOK_URL
  if (ledgerUrl && docDateForSync) {
    fetch(ledgerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: docDateForSync.slice(0, 7) }),
    }).catch(() => {})
  }

  return NextResponse.json(data)
}
