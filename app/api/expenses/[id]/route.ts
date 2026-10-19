import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram } from '@/lib/telegram'
import { updateFlowAccountSync, deleteFlowAccountSync } from '@/lib/expenseSync'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: sourceRow } = await supabase.from('expenses').select('source, is_deleted').eq('id', id).maybeSingle()
  if (sourceRow?.source === 'flowaccount_payment_slip') {
    return NextResponse.json({ error: 'รายการจาก FlowAccount เป็นแบบอ่านอย่างเดียว กรุณาแก้ที่ FlowAccount แล้ว Sync ใหม่' }, { status: 409 })
  }
  if (sourceRow?.is_deleted) return NextResponse.json({ error: 'รายการนี้ถูกลบแล้ว' }, { status: 404 })
  const cookieStore = await cookies()
  const updaterName = cookieStore.get('kintsu_acc_name')?.value || null

  const body = await req.json()
  const { amount_satang, vat_satang, vat_inclusive, wht_satang, discount_satang, items, ...rest } = body as {
    amount_satang?: number
    vat_satang?: number
    vat_inclusive?: boolean
    wht_satang?: number
    discount_satang?: number
    items?: { category: string; description: string; quantity: number; unit: string; price_per_unit_satang: number }[]
    [k: string]: any
  }

  // Same derivation as the POST route: when line items are given, they're the source
  // of truth for the amount and (display-only) category.
  const hasItems = Array.isArray(items) && items.length > 0
  const computedAmountSatang = hasItems
    ? items!.reduce((sum, i) => sum + Math.round(i.quantity * i.price_per_unit_satang), 0)
    : amount_satang
  const distinctCategories = hasItems ? [...new Set(items!.map((i) => i.category))] : []

  // flowaccount_* link/sync/status columns are server-controlled; a client must not be able to
  // clear them (bypassing the duplicate guard) or forge payment status.
  for (const k of Object.keys(rest)) if (k.startsWith('flowaccount_')) delete rest[k]
  // Soft-delete and identity/origin fields are owned by DELETE / server flows (DELETE does the
  // FlowAccount cleanup; `source` drives the read-only guard) — never client-settable here.
  for (const k of ['is_deleted', 'deleted_at', 'id', 'source']) delete rest[k]

  const updates: Record<string, unknown> = {
    ...rest,
    updated_at: new Date().toISOString(),
    updated_by_name: updaterName,
  }
  if (hasItems) {
    updates.category = distinctCategories.length === 1 ? distinctCategories[0] : `หลายหมวดหมู่ (${distinctCategories.length})`
  }

  if (computedAmountSatang !== undefined) {
    // total_satang (จำนวนเงินรวมทั้งสิ้น) = amount_satang - discount, plus VAT on top
    // when vat_inclusive is false (VAT not already baked into the item prices).
    // amount_satang itself stays the raw item-line sum — unaffected, still the P&L cost basis.
    const isVatInclusive = vat_inclusive ?? true
    const totalAfterDiscount = computedAmountSatang - (discount_satang || 0)
    updates.amount_satang = computedAmountSatang
    updates.vat_satang = vat_satang || 0
    updates.vat_inclusive = isVatInclusive
    updates.wht_satang = wht_satang || 0
    updates.discount_satang = discount_satang || 0
    updates.total_satang = totalAfterDiscount + (isVatInclusive ? 0 : (vat_satang || 0))
  }

  // Refused atomically while a FlowAccount create is in flight / locked (synced_at set, no
  // record_id) — see the claim comment in syncExpenseToFlowAccount for why this plus the
  // re-read below can't silently diverge.
  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .eq('is_deleted', false)
    .or('flowaccount_record_id.not.is.null,flowaccount_synced_at.is.null')
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    if (!sourceRow) return NextResponse.json({ error: 'ไม่พบรายการค่าใช้จ่าย' }, { status: 404 })
    return NextResponse.json({ error: 'รายการนี้กำลังส่งเข้า FlowAccount อยู่ (หรือส่งค้างไม่แน่ใจผล) — แก้ไขไม่ได้ตอนนี้ กรุณารอสักครู่แล้วลองใหม่ ถ้ายังแก้ไม่ได้ให้ตรวจใน FlowAccount ก่อนว่ามีเอกสารแล้วหรือยัง' }, { status: 409 })
  }

  // items === undefined means the client didn't touch line items at all (a status-only
  // edit, etc.) — leave existing rows alone. Any array (including []) means the client
  // owns the full itemized set now, so replace what's stored.
  if (items !== undefined) {
    const { error: deleteItemsError } = await supabase.from('expense_items').update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    }).eq('expense_id', id).eq('is_deleted', false)
    if (deleteItemsError) return NextResponse.json({ error: deleteItemsError.message }, { status: 500 })
    if (hasItems) {
      const { error: itemsError } = await supabase.from('expense_items').upsert(
        items!.map((i, idx) => ({
          expense_id: id,
          category: i.category,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit || 'รายการ',
          price_per_unit_satang: i.price_per_unit_satang,
          total_satang: Math.round(i.quantity * i.price_per_unit_satang),
          sort_order: idx,
          is_deleted: false,
          deleted_at: null,
        })),
        { onConflict: 'expense_id,sort_order' },
      )
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  // Propagate the edit to FlowAccount too, if this expense was already synced —
  // otherwise the two would silently drift apart. A failure here doesn't fail the
  // local edit (already saved above); staff are alerted to reconcile manually.
  // Re-read the link AFTER all writes above (not `data`): a create may have saved record_id
  // meanwhile — then this edit must be pushed here; if not, the create's own post-save
  // re-read sees these writes and alerts.
  const { data: link } = await supabase.from('expenses').select('flowaccount_record_id, flowaccount_document_serial').eq('id', id).maybeSingle()
  if (link?.flowaccount_record_id) {
    data.flowaccount_record_id = link.flowaccount_record_id
    data.flowaccount_document_serial = link.flowaccount_document_serial
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
  const { data: sourceRow } = await supabase.from('expenses').select('source').eq('id', id).maybeSingle()
  if (sourceRow?.source === 'flowaccount_payment_slip') {
    return NextResponse.json({ error: 'รายการจาก FlowAccount เป็นแบบอ่านอย่างเดียว กรุณาลบ/void ที่ FlowAccount แล้ว Sync ใหม่' }, { status: 409 })
  }
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value

  if (!sourceRow) return NextResponse.json({ error: 'ไม่พบรายการค่าใช้จ่าย' }, { status: 404 })

  // Refuse (atomically, in the same UPDATE) while a FlowAccount create is in flight —
  // flowaccount_synced_at set but no record_id yet. Deleting then would let the create finish
  // and attach a new document to a deleted row (orphaned in FlowAccount). Chosen over
  // "delete the just-created document afterwards" because that cleanup can itself fail.
  // Trade-off: a row locked by an ambiguous create failure can't be deleted until someone
  // checks FlowAccount and clears/links it by hand.
  const { data, error } = await supabase
    .from('expenses')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .or('flowaccount_record_id.not.is.null,flowaccount_synced_at.is.null')
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json({ error: 'รายการนี้กำลังส่งเข้า FlowAccount อยู่ (หรือส่งค้างไม่แน่ใจผล) — ลบไม่ได้ตอนนี้ กรุณารอสักครู่แล้วลองใหม่ ถ้ายังลบไม่ได้ให้ตรวจใน FlowAccount ก่อนว่ามีเอกสารแล้วหรือยัง' }, { status: 409 })
  }

  // Telegram notification
  if (data) {
    const docDate = data.document_date || data.date
    sendTelegram(`🗑️ <b>ลบรายจ่าย</b>\n📁 ${data.category}${data.note ? ` — ${data.note}` : ''}\n💰 ฿${(data.amount_satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })}\n📅 ${docDate}`, 'expenses')
  }

  // Delete the FlowAccount document too, if this expense was already synced — otherwise
  // it would keep showing up in FlowAccount forever with no trace it was ever removed
  // here. A failure doesn't undo the local delete (already soft-deleted above); staff
  // are alerted to void/delete it manually in FlowAccount instead.
  if (data?.flowaccount_record_id && data.flowaccount_payment_status !== 'cancelled') {
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
