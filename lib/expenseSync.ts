import { FlowAccountError, isDefiniteRejection, getExpenseDocument, createExpense, updateExpense, deleteExpenseDocument, attachExpenseFiles, listFlowAccountExpenses, findContact, payExpense, type FlowAccountContact, type ExpensePaymentChannel } from '@/lib/flowaccount'
import { extractVendorInfoFromReceipt } from '@/lib/vendorOcr'
import { sendTelegram } from '@/lib/telegram'
import { isCancelledStatus, type FlowAccountExpenseDocument } from './flowaccountExpenseImport'

// Resolves this expense's local payment_method to a FlowAccount payment channel.
// Only applies to expenses entered directly in this app (paid on the spot by
// staff) — expenses the accountant enters straight into FlowAccount and pays
// once via ใบเตรียมจ่าย/ใบสำคัญจ่าย (Payment Voucher) never come through here,
// so there's no double-payment risk between the two flows.
//   - 'เงินสด' — Cash (method 1), no extra fields.
//   - 'โอนเงิน' — Transfer (method 5) from the expense's own bank_account_id,
//     via that row's flowaccount_bank_account_id mapping (Settings > บัญชี
//     ธนาคาร). Not yet mapped → leave awaiting with an error, not a guess.
//   - 'บัตรเครดิต' — paid by swiping the company card through the EDC terminal,
//     which FlowAccount models as an "Other" channel (method 13), same
//     FLOWACCOUNT_EDC_CHANNEL_ID this app's sell-side card payments already
//     use — not FlowAccount's separate "CreditCard" method, which has no
//     channel configured at all (verified via company_settings__list_
//     payment_channels: zero channels).
//   - 'เครดิต' — bought on credit, genuinely not paid yet — leave awaiting.
async function resolvePaymentChannel(supabase: any, expense: any): Promise<{ ok: true; channel: ExpensePaymentChannel } | { ok: false; error?: string }> {
  if (expense.payment_method === 'เงินสด') return { ok: true, channel: { method: 'cash' } }

  if (expense.payment_method === 'บัตรเครดิต') {
    const otherChannelId = Number(process.env.FLOWACCOUNT_EDC_CHANNEL_ID)
    if (!otherChannelId) return { ok: false, error: 'ยังไม่ได้ตั้งค่าเครื่องรูดบัตร EDC (FLOWACCOUNT_EDC_CHANNEL_ID)' }
    return { ok: true, channel: { method: 'other', otherChannelId } }
  }

  if (expense.payment_method === 'โอนเงิน') {
    if (!expense.bank_account_id) return { ok: false, error: 'ไม่ได้ระบุบัญชีธนาคารที่โอน' }
    const { data: bank } = await supabase
      .from('bank_accounts')
      .select('flowaccount_bank_account_id, bank_name, account_number')
      .eq('id', expense.bank_account_id)
      .maybeSingle()
    if (!bank?.flowaccount_bank_account_id) {
      return { ok: false, error: `บัญชี ${bank?.bank_name ?? ''} ${bank?.account_number ?? ''} ยังไม่ได้ผูกกับ FlowAccount (ไปตั้งค่าที่หน้าบัญชีธนาคารก่อน)` }
    }
    return { ok: true, channel: { method: 'transfer', bankAccountId: bank.flowaccount_bank_account_id } }
  }

  return { ok: false } // 'เครดิต' / unrecognized — leave awaiting, no error to surface
}

// Looks up one category's FlowAccount mapping. FlowAccount's ExpenseProductItem schema
// (flowaccount-openapi.json) marks systemCode/categoryId required on every line item,
// not just debit_id/credit_id — a category mapped only to a plain chart-of-account
// entry (no matching business category) fails sync with an opaque error at
// FlowAccount's end. Gate on all four so that failure surfaces here instead.
async function resolveCategoryMapping(supabase: any, categoryName: string) {
  const { data: category } = await supabase
    .from('expense_categories')
    .select('flowaccount_system_code, flowaccount_category_id, flowaccount_credit_id, flowaccount_credit_category, flowaccount_debit_id, flowaccount_debit_category')
    .eq('name', categoryName)
    .eq('category_type', 'expense')
    .maybeSingle()

  if (
    !category ||
    category.flowaccount_debit_id == null ||
    category.flowaccount_system_code == null ||
    category.flowaccount_category_id == null
  ) {
    return { ok: false as const, error: `หมวดหมู่ "${categoryName}" ยังไม่ได้ผูกกับ FlowAccount (ต้องเลือกจาก "หมวดหมู่นักธุรกิจ") — ไปตั้งค่าที่หน้าหมวดหมู่ก่อน` }
  }
  return { ok: true as const, category }
}

// Builds the FlowAccount items[] array for one expense — from its expense_items rows
// when present (each resolved to its own category, so one bill can span several), or
// a single fallback item using the expense's own category otherwise (expenses saved
// before line items existed, or a simple one-line entry that never got itemized).
async function resolveItems(supabase: any, expense: any) {
  const { data: rows } = await supabase
    .from('expense_items')
    .select('category, description, quantity, unit, price_per_unit_satang')
    .eq('expense_id', expense.id)
    .eq('is_deleted', false)
    .order('sort_order')

  const sourceItems =
    rows && rows.length > 0
      ? rows.map((r: any) => ({ categoryName: r.category, description: r.description, quantity: r.quantity, unitName: r.unit || 'รายการ', pricePerUnitSatang: r.price_per_unit_satang }))
      // description here is the FlowAccount line item's product name, not the expense's
      // own remarks — expense.note is sent separately as the document's remarks (see
      // buildExpenseInput) and must never leak into the item name.
      : [{ categoryName: expense.category, description: expense.category, quantity: 1, unitName: 'รายการ', pricePerUnitSatang: expense.total_satang }]

  const items = []
  for (const item of sourceItems) {
    const resolved = await resolveCategoryMapping(supabase, item.categoryName)
    if (!resolved.ok) return resolved
    items.push({
      description: item.description,
      category: {
        systemCode: resolved.category.flowaccount_system_code,
        categoryId: resolved.category.flowaccount_category_id,
        nameLocal: '',
        nameForeign: '',
        creditId: resolved.category.flowaccount_credit_id,
        creditCategory: resolved.category.flowaccount_credit_category,
        debitId: resolved.category.flowaccount_debit_id,
        debitCategory: resolved.category.flowaccount_debit_category,
      },
      quantity: item.quantity,
      unitName: item.unitName,
      pricePerUnit: item.pricePerUnitSatang / 100,
    })
  }
  return { ok: true as const, items }
}

// Resolves the vendor contact — shared by syncExpenseToFlowAccount (create) and
// updateFlowAccountSync (edit).
async function resolveContact(expense: any) {
  const contactName = expense.recipient_name || expense.sender_name || 'ไม่ระบุผู้รับเงิน'
  // Best-effort — a lookup failure shouldn't block the sync, just fall back to
  // creating a plain ad-hoc contact by name (the pre-existing behavior).
  let contact: FlowAccountContact | null = await findContact(contactName).catch(() => null)

  // No existing FlowAccount contact for this vendor — try reading its name/address off
  // the attached bill/receipt photo (not the payment slip) so a brand-new vendor still
  // gets a real address instead of FlowAccount's default blank ad-hoc contact.
  const receiptUrl = expense.receipt_image_urls?.[0]
  // New expense-bill OCR fills recipient_address during upload. Only use the
  // legacy vendor OCR fallback for historical rows that still lack an address;
  // otherwise the same bill would trigger a second model call during sync.
  if (!contact && receiptUrl && !expense.recipient_address) {
    const extracted = await extractVendorInfoFromReceipt(receiptUrl).catch(() => null)
    if (extracted?.address) {
      contact = { name: extracted.name || contactName, address: extracted.address, taxId: extracted.taxId, branch: extracted.branch }
    }
  }

  // A manually-typed address on the form always wins over findContact/OCR — it's the
  // one signal a human directly confirmed, so it can correct a stale contact-master
  // address or fill in what OCR couldn't read.
  if (expense.recipient_address) {
    contact = { ...(contact ?? { name: contactName, taxId: '', branch: '' }), address: expense.recipient_address }
  }

  return { contactName, contact }
}

function buildExpenseInput(expense: any, items: any[], contactName: string, contact: FlowAccountContact | null) {
  return {
    contactName,
    contact,
    publishedOn: expense.document_date || expense.date,
    remarks: expense.note ?? '',
    vatAmount: expense.vat_satang ? expense.vat_satang / 100 : undefined,
    vatInclusive: expense.vat_inclusive ?? true,
    discountAmount: expense.discount_satang ? expense.discount_satang / 100 : 0,
    items,
  }
}

// Everything the FlowAccount document is derived from (incl. resolveContact's inputs), to
// detect an edit made while a create was in flight.
function syncSnapshot(expense: Parameters<typeof buildExpenseInput>[0], items: Parameters<typeof buildExpenseInput>[1]) {
  return JSON.stringify([buildExpenseInput(expense, items, '', null), expense.recipient_name, expense.sender_name, expense.recipient_address, expense.receipt_image_urls?.[0] ?? null])
}

// Shared by the manual "ส่งเข้า FlowAccount" button and the automatic sync that
// runs right after an expense is saved. Looks up the FlowAccount category mapping,
// creates the expense document, and best-effort attaches the slip/receipt photos.
// Deliberately does NOT mark the document paid — it's left "รอดำเนินการ (Awaiting)" in
// FlowAccount so staff can still fix mistakes there (via updateFlowAccountSync below)
// before confirming payment through payFlowAccountSync's "ชำระเงิน" button.
export async function syncExpenseToFlowAccount(supabase: any, expenseId: string) {
  const { data: current, error: expenseError } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .single()
  if (expenseError || !current) {
    return { ok: false as const, error: expenseError?.message || 'ไม่พบรายการค่าใช้จ่าย' }
  }
  // Idempotency: this function only ever CREATES a FlowAccount document. Re-running it on
  // an already-linked expense used to create a second (third…) document and overwrite
  // the stored serial, orphaning the earlier ones. Edits go through updateFlowAccountSync.
  if (current.flowaccount_record_id || current.flowaccount_document_serial) {
    return { ok: false as const, error: `รายการนี้ส่งเข้า FlowAccount แล้ว (${current.flowaccount_document_serial ?? current.flowaccount_record_id}) — ส่งซ้ำไม่ได้ ถ้าต้องแก้ไขให้กด "แก้ไข" แทน`, alreadySynced: true as const }
  }

  // Atomic claim so two concurrent calls (double-tap, auto-sync on save + manual button)
  // can't both reach createExpense. flowaccount_synced_at is only ever set together with
  // flowaccount_record_id on expenses, so "synced_at set, record_id null" = in flight.
  // ponytail: a crash between create and the final update leaves the row claimed with no
  // record id — deliberately NOT auto-released (the document may exist in FlowAccount);
  // check FlowAccount, then clear flowaccount_synced_at by hand to allow a retry.
  // is_deleted=false here + DELETE refusing in-flight rows (expenses/[id] route) make the
  // claim and a delete mutually exclusive at the row level: no document for a deleted row.
  //
  // Edits vs an in-flight create (no forwarding update — two pushers could land out of order):
  // PATCH refuses (409) while claimed, atomically in its UPDATE, and pushes its own edit only
  // if it sees record_id after all its writes. The document is built from the row returned BY
  // the claim (+ items read after it), so everything written before the claim is sent. After
  // record_id is saved we re-read (C): an edit write before C shows as a diff → Telegram
  // alert (fail-safe, manual); an edit write after C means that PATCH's final re-read also
  // comes after C, sees record_id and pushes itself. Either way nothing diverges silently.
  const { data: claimedRow, error: claimError } = await supabase
    .from('expenses')
    .update({ flowaccount_synced_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .is('flowaccount_record_id', null)
    .is('flowaccount_synced_at', null)
    .select('*')
    .maybeSingle()
  if (claimError) return { ok: false as const, error: claimError.message }
  if (!claimedRow) {
    return { ok: false as const, error: 'รายการนี้กำลังส่ง/เคยส่งเข้า FlowAccount ค้างอยู่ — ตรวจใน FlowAccount ก่อนว่ามีเอกสารแล้วหรือยัง เพื่อไม่ให้เกิดเอกสารซ้ำ', alreadySynced: true as const }
  }
  const releaseClaim = () => supabase.from('expenses').update({ flowaccount_synced_at: null }).eq('id', expenseId).is('flowaccount_record_id', null)
  const expense = claimedRow

  let resolvedItems: Awaited<ReturnType<typeof resolveItems>>
  let resolvedContact: Awaited<ReturnType<typeof resolveContact>>
  try {
    resolvedItems = await resolveItems(supabase, expense)
    resolvedContact = await resolveContact(expense)
  } catch (err) {
    resolvedItems = { ok: false as const, error: (err as Error).message }
    resolvedContact = { contactName: '', contact: null }
  }
  if (!resolvedItems.ok) {
    await releaseClaim() // nothing sent yet
    return resolvedItems
  }
  const { contactName, contact } = resolvedContact

  const sentSnapshot = syncSnapshot(expense, resolvedItems.items)
  let result: { recordId: number; documentSerial: string } | null
  const ambiguous = (detail: string) => ({ ok: false as const, error: `ส่งเข้า FlowAccount ไม่แน่ใจว่าสำเร็จหรือไม่ (${detail}) — รายการนี้ถูกล็อกไว้ กรุณาตรวจใน FlowAccount ก่อนว่ามีเอกสารแล้วหรือยัง ก่อนส่งซ้ำ`, alreadySynced: true as const })
  try {
    result = await createExpense(buildExpenseInput(expense, resolvedItems.items, contactName, contact))
  } catch (err) {
    // Release only on a definite rejection (nothing created). Network/timeout/5xx/unparseable
    // are ambiguous — the document may exist, so keep the row locked.
    if (isDefiniteRejection(err)) {
      await releaseClaim()
      return { ok: false as const, error: (err as Error).message }
    }
    return ambiguous((err as Error).message)
  }
  // Empty 2xx body: FlowAccount may have created the document but we have no id to link.
  if (!result?.recordId) return ambiguous('FlowAccount ตอบกลับโดยไม่มีเลขเอกสาร')

  try {
    // Link first: a function kill during the (slow) attach must not strand the FA doc unlinked.
    const { data: updated, error: updateError } = await supabase
      .from('expenses')
      .update({
        flowaccount_record_id: result.recordId,
        flowaccount_document_serial: result.documentSerial,
        flowaccount_synced_at: new Date().toISOString(),
      })
      .eq('id', expenseId)
      .select()
      .single()
    if (updateError) return { ok: false as const, error: `สร้าง ${result.documentSerial} ใน FlowAccount แล้ว แต่บันทึกลงระบบไม่สำเร็จ: ${updateError.message}` }

    const imageUrls = [expense.slip_image_url, ...(expense.receipt_image_urls ?? [])].filter(Boolean)
    if (imageUrls.length > 0) {
      try {
        await attachExpenseFiles(result.recordId, imageUrls)
      } catch (attachErr: any) {
        // Document already created and linked — a failed attachment shouldn't fail the sync,
        // just tell staff so they can attach it manually in FlowAccount if it matters.
        sendTelegram(
          `⚠️ ส่ง ${result.documentSerial} เข้า FlowAccount สำเร็จ แต่แนบรูปสลิป/บิลไม่สำเร็จ: ${attachErr.message}`,
          'expenses',
        )
      }
    }

    // Re-read C (see the claim comment): a difference = an edit landed during the create.
    // Alert only — never push from here.
    const fresh = await resolveItems(supabase, updated)
    if (!fresh.ok || syncSnapshot(updated, fresh.items) !== sentSnapshot) {
      sendTelegram(`⚠️ รายจ่ายถูกแก้ไขระหว่างส่ง ${result.documentSerial} เข้า FlowAccount — เอกสารใน FlowAccount อาจไม่ตรงกับในระบบ\nกรุณาเปิดรายการนี้ กด "แก้ไข" แล้วบันทึกอีกครั้ง (หรือแก้ใน FlowAccount ให้ตรงกัน)`, 'expenses')
    }

    return { ok: true as const, data: updated }
  } catch (err: any) {
    // Document already exists in FlowAccount — keep the claim so nothing re-creates it.
    return { ok: false as const, error: `สร้าง ${result?.documentSerial ?? ''} ใน FlowAccount แล้ว แต่บันทึกลงระบบไม่สำเร็จ: ${err.message}` }
  }
}

// Called from the expense PATCH route right after a local edit — only does anything if
// the expense was already synced (flowaccount_record_id set). FlowAccount's PUT only
// works while the document is still "รอดำเนินการ (Awaiting)" — true until staff confirm
// payment via payFlowAccountSync below. Editing one that's already been marked paid
// fails here as expected; treated as a soft error (Telegram alert telling staff to fix
// it directly in FlowAccount), not something that blocks the local edit from saving.
export async function updateFlowAccountSync(supabase: any, expenseId: string) {
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .single()
  if (expenseError || !expense) {
    return { ok: false as const, error: expenseError?.message || 'ไม่พบรายการค่าใช้จ่าย' }
  }
  if (!expense.flowaccount_record_id) return { ok: true as const } // never synced — nothing to update
  if (expense.flowaccount_payment_status === 'cancelled') return { ok: true as const } // deleted/voided in FlowAccount — nothing to update

  const resolvedItems = await resolveItems(supabase, expense)
  if (!resolvedItems.ok) return resolvedItems
  const { contactName, contact } = await resolveContact(expense)

  try {
    await updateExpense(expense.flowaccount_record_id, buildExpenseInput(expense, resolvedItems.items, contactName, contact))
    await supabase.from('expenses').update({ flowaccount_synced_at: new Date().toISOString() }).eq('id', expenseId)
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err.message }
  }
}

// Called from the "ชำระเงิน" button on the expense detail page — the deliberate,
// staff-triggered step that marks an already-synced, still-"รอดำเนินการ (Awaiting)"
// FlowAccount document as paid. Kept separate from syncExpenseToFlowAccount (instead of
// paying automatically right after create) precisely so staff get a chance to review or
// fix a mistake first: FlowAccount's PUT only works pre-payment, so once this runs,
// updateFlowAccountSync above can no longer correct anything — it has to be fixed
// directly in FlowAccount.
export async function payFlowAccountSync(supabase: any, expenseId: string) {
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .single()
  if (expenseError || !expense) {
    return { ok: false as const, error: expenseError?.message || 'ไม่พบรายการค่าใช้จ่าย' }
  }
  if (!expense.flowaccount_record_id) return { ok: false as const, error: 'ยังไม่ได้ส่งเข้า FlowAccount' }
  if (expense.flowaccount_paid_at) return { ok: true as const, data: expense } // already paid — nothing to do

  const paymentChannel = await resolvePaymentChannel(supabase, expense)
  if (!paymentChannel.ok) {
    return { ok: false as const, error: paymentChannel.error || 'ไม่รู้จักวิธีชำระเงินนี้ — ต้องลงชำระเองใน FlowAccount' }
  }

  try {
    // total_satang (จำนวนเงินรวมทั้งสิ้น) already carries VAT/discount the same way
    // FlowAccount's own grandTotal does — the net amount that actually moved through
    // this channel is that minus any withheld tax (the withheld portion never reaches
    // the vendor's bank account at all).
    const collected = expense.total_satang / 100 - (expense.wht_satang ?? 0) / 100
    await payExpense(expense.flowaccount_record_id, expense.document_date || expense.date, collected, paymentChannel.channel)
    const { data: updated, error: updateError } = await supabase
      .from('expenses')
      .update({ flowaccount_paid_at: new Date().toISOString() })
      .eq('id', expenseId)
      .select()
      .single()
    if (updateError) return { ok: false as const, error: updateError.message }
    return { ok: true as const, data: updated }
  } catch (err: any) {
    return { ok: false as const, error: err.message }
  }
}

// Called from the expense DELETE route right after a local soft-delete. Same "must be
// awaiting" constraint as updateFlowAccountSync above.
export async function deleteFlowAccountSync(recordId: number) {
  try {
    await deleteExpenseDocument(recordId)
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err.message }
  }
}

// Detects a document deleted/voided in FlowAccount and marks the expense cancelled
// (flowaccount_payment_status='cancelled', same marker the PAY import uses). The serial /
// record id are kept for audit. Read-only against FlowAccount (GET only).
export async function refreshFlowAccountStatus(supabase: any, expenseId: string) {
  const { data: expense } = await supabase
    .from('expenses').select('flowaccount_record_id, flowaccount_payment_status').eq('id', expenseId).maybeSingle()
  if (!expense?.flowaccount_record_id) return { ok: true as const, cancelled: false }
  if (expense.flowaccount_payment_status === 'cancelled') return { ok: true as const, cancelled: true }

  let cancelled = false
  try {
    const doc = (await getExpenseDocument(expense.flowaccount_record_id)) as FlowAccountExpenseDocument | null
    // An empty/non-object payload is ambiguous, not "deleted".
    if (!doc || typeof doc !== 'object' || Object.keys(doc).length === 0) return { ok: false as const, error: 'FlowAccount ตอบกลับข้อมูลเอกสารไม่ถูกต้อง' }
    cancelled = doc.isDelete === true || isCancelledStatus(doc)
  } catch (err) {
    // Only a JSON-bodied 404 (fromApiJson; not HTML/proxy) from the document fetch counts as deleted; a 404 from the token
    // request (notSent) or any other error (network, 401, 5xx) must not cancel.
    if (!(err instanceof FlowAccountError && err.status === 404 && !err.notSent && err.fromApiJson)) return { ok: false as const, error: (err as Error).message }
    // A JSON 404 could also mean a wrong endpoint/credentials: confirm with one cheap known-good
    // read (1-row list) before declaring the document deleted.
    try {
      const today = new Date().toISOString().slice(0, 10)
      await listFlowAccountExpenses(today, today, 1, 1)
    } catch (healthErr) {
      return { ok: false as const, error: `ตรวจสอบสถานะ FlowAccount ไม่ได้ (${(healthErr as Error).message})` }
    }
    cancelled = true
  }
  if (cancelled) {
    const { error } = await supabase.from('expenses')
      .update({ flowaccount_payment_status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', expenseId)
    if (error) return { ok: false as const, error: error.message }
  }
  return { ok: true as const, cancelled }
}
