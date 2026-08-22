import { createExpense, updateExpense, deleteExpenseDocument, attachExpenseFiles, findContact, type FlowAccountContact } from '@/lib/flowaccount'
import { extractVendorInfoFromReceipt } from '@/lib/vendorOcr'
import { sendTelegram } from '@/lib/telegram'

// Shared by syncExpenseToFlowAccount (create) and updateFlowAccountSync (edit) — looks
// up the category mapping (gated on systemCode/categoryId, see comment below) and
// resolves the vendor contact the same way for both.
async function resolveCategoryAndContact(supabase: any, expense: any) {
  const { data: category } = await supabase
    .from('expense_categories')
    .select('flowaccount_system_code, flowaccount_category_id, flowaccount_credit_id, flowaccount_credit_category, flowaccount_debit_id, flowaccount_debit_category')
    .eq('name', expense.category)
    .eq('category_type', 'expense')
    .maybeSingle()

  // FlowAccount's ExpenseProductItem schema (flowaccount-openapi.json) marks systemCode
  // and categoryId as required on every line item, not just debit_id/credit_id — a
  // category mapped only to a plain chart-of-account entry (no matching business
  // category) fails sync with an opaque error at FlowAccount's end. Gate on all four
  // so that failure surfaces here instead, with a message that says what to fix.
  if (
    !category ||
    category.flowaccount_debit_id == null ||
    category.flowaccount_system_code == null ||
    category.flowaccount_category_id == null
  ) {
    return { ok: false as const, error: `หมวดหมู่ "${expense.category}" ยังไม่ได้ผูกกับ FlowAccount (ต้องเลือกจาก "หมวดหมู่นักธุรกิจ") — ไปตั้งค่าที่หน้าหมวดหมู่ก่อน` }
  }

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

  return { ok: true as const, category, contactName, contact }
}

function buildExpenseInput(expense: any, category: any, contactName: string, contact: FlowAccountContact | null) {
  return {
    contactName,
    contact,
    publishedOn: expense.document_date || expense.date,
    remarks: expense.note ?? '',
    vatAmount: expense.vat_satang ? expense.vat_satang / 100 : undefined,
    items: [
      {
        description: expense.note || expense.category,
        category: {
          systemCode: category.flowaccount_system_code,
          categoryId: category.flowaccount_category_id,
          nameLocal: '',
          nameForeign: '',
          creditId: category.flowaccount_credit_id,
          creditCategory: category.flowaccount_credit_category,
          debitId: category.flowaccount_debit_id,
          debitCategory: category.flowaccount_debit_category,
        },
        quantity: 1,
        unitName: 'รายการ',
        pricePerUnit: expense.total_satang / 100,
      },
    ],
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

  const resolved = await resolveCategoryAndContact(supabase, expense)
  if (!resolved.ok) return resolved

  try {
    const result = await createExpense(buildExpenseInput(expense, resolved.category, resolved.contactName, resolved.contact))

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

  const resolved = await resolveCategoryAndContact(supabase, expense)
  if (!resolved.ok) return resolved

  try {
    await updateExpense(expense.flowaccount_record_id, buildExpenseInput(expense, resolved.category, resolved.contactName, resolved.contact))
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
