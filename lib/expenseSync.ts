import { createExpense, updateExpense, deleteExpenseDocument, attachExpenseFiles, findContact, payExpense, type FlowAccountContact, type ExpensePaymentChannel } from '@/lib/flowaccount'
import { extractVendorInfoFromReceipt } from '@/lib/vendorOcr'
import { sendTelegram } from '@/lib/telegram'

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

// Shared by the manual "ส่งเข้า FlowAccount" button and the automatic sync that
// runs right after an expense is saved. Looks up the FlowAccount category mapping,
// creates the expense document, and best-effort attaches the slip/receipt photos.
// Deliberately does NOT mark the document paid — it's left "รอดำเนินการ (Awaiting)" in
// FlowAccount so staff can still fix mistakes there (via updateFlowAccountSync below)
// before confirming payment through payFlowAccountSync's "ชำระเงิน" button.
export async function syncExpenseToFlowAccount(supabase: any, expenseId: string) {
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('is_deleted', false)
    .single()
  if (expenseError || !expense) {
    return { ok: false as const, error: expenseError?.message || 'ไม่พบรายการค่าใช้จ่าย' }
  }

  const resolvedItems = await resolveItems(supabase, expense)
  if (!resolvedItems.ok) return resolvedItems
  const { contactName, contact } = await resolveContact(expense)

  try {
    const result = await createExpense(buildExpenseInput(expense, resolvedItems.items, contactName, contact))

    const imageUrls = [expense.slip_image_url, ...(expense.receipt_image_urls ?? [])].filter(Boolean)
    if (imageUrls.length > 0) {
      try {
        await attachExpenseFiles(result.recordId, imageUrls)
      } catch (attachErr: any) {
        // Document already created — a failed attachment shouldn't fail the whole sync,
        // just tell staff so they can attach it manually in FlowAccount if it matters.
        sendTelegram(
          `⚠️ ส่ง ${result.documentSerial} เข้า FlowAccount สำเร็จ แต่แนบรูปสลิป/บิลไม่สำเร็จ: ${attachErr.message}`,
          'expenses',
        )
      }
    }

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
    if (updateError) return { ok: false as const, error: updateError.message }

    return { ok: true as const, data: updated }
  } catch (err: any) {
    return { ok: false as const, error: err.message }
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
