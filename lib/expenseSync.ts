import { createExpense, updateExpense, deleteExpenseDocument, attachExpenseFiles, findContact, type FlowAccountContact } from '@/lib/flowaccount'
import { extractVendorInfoFromReceipt } from '@/lib/vendorOcr'
import { sendTelegram } from '@/lib/telegram'

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
    .order('sort_order')

  const sourceItems =
    rows && rows.length > 0
      ? rows.map((r: any) => ({ categoryName: r.category, description: r.description, quantity: r.quantity, unitName: r.unit || 'รายการ', pricePerUnitSatang: r.price_per_unit_satang }))
      : [{ categoryName: expense.category, description: expense.note || expense.category, quantity: 1, unitName: 'รายการ', pricePerUnitSatang: expense.total_satang }]

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
  if (!contact && receiptUrl) {
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
    items,
  }
}

// Shared by the manual "ส่งเข้า FlowAccount" button and the automatic sync that
// runs right after an expense is saved. Looks up the FlowAccount category mapping,
// creates the expense document, and best-effort attaches the slip/receipt photos.
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
// works while the document is still "รอดำเนินการ (Awaiting)", which every expense this
// app creates always is (createExpense() never posts via with-payment), so this should
// always succeed for a previously-synced expense — but treat failure as a soft error
// (Telegram alert), not something that blocks the local edit from saving.
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
