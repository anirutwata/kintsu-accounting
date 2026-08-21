import { createExpense, attachExpenseFiles, findContact } from '@/lib/flowaccount'
import { sendTelegram } from '@/lib/telegram'

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

  const { data: category } = await supabase
    .from('expense_categories')
    .select('flowaccount_system_code, flowaccount_category_id, flowaccount_credit_id, flowaccount_credit_category, flowaccount_debit_id, flowaccount_debit_category')
    .eq('name', expense.category)
    .eq('category_type', 'expense')
    .maybeSingle()

  // flowaccount_category_id is only set for the curated "business category" subset —
  // most chart-of-account categories post via debit_id/credit_id alone, so that's the
  // real gate (see lib/flowaccount.ts createExpense).
  if (!category || category.flowaccount_debit_id == null) {
    return { ok: false as const, error: `หมวดหมู่ "${expense.category}" ยังไม่ได้ผูกกับ FlowAccount — ไปตั้งค่าที่หน้าหมวดหมู่ก่อน` }
  }

  try {
    const contactName = expense.recipient_name || expense.sender_name || 'ไม่ระบุผู้รับเงิน'
    // Best-effort — a lookup failure shouldn't block the sync, just fall back to
    // creating a plain ad-hoc contact by name (the pre-existing behavior).
    const contact = await findContact(contactName).catch(() => null)

    const result = await createExpense({
      contactName,
      contact,
      publishedOn: expense.document_date || expense.date,
      remarks: expense.note ?? '',
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
    })

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
