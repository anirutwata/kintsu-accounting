import { listFlowAccountExpenses } from './flowaccount'
import {
  mapFlowAccountExpense,
  selectImportCandidates,
  type FlowAccountExpenseDocument,
} from './flowaccountExpenseImport'
import type { SupabaseClient } from '@supabase/supabase-js'

export const FLOWACCOUNT_IMPORT_START_DATE = '2026-06-01'

function todayBkk(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

async function fetchPaymentSlipExpenses(endDate = todayBkk()): Promise<FlowAccountExpenseDocument[]> {
  const pageSize = 200
  const first = await listFlowAccountExpenses(FLOWACCOUNT_IMPORT_START_DATE, endDate, 1, pageSize)
  const documents = [...first.list] as FlowAccountExpenseDocument[]
  const pages = Math.ceil(first.totalDocument / pageSize)
  for (let page = 2; page <= pages; page += 1) {
    const next = await listFlowAccountExpenses(FLOWACCOUNT_IMPORT_START_DATE, endDate, page, pageSize)
    documents.push(...next.list as FlowAccountExpenseDocument[])
  }
  return selectImportCandidates(documents, new Set())
}

async function categoryMap(supabase: SupabaseClient): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('name, flowaccount_debit_id')
    .eq('category_type', 'expense')
    .eq('is_active', true)
    .not('flowaccount_debit_id', 'is', null)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map(row => [Number(row.flowaccount_debit_id), String(row.name)]))
}

export async function previewFlowAccountPaymentSlipSync(supabase: SupabaseClient) {
  const documents = await fetchPaymentSlipExpenses()
  const recordIds = documents.map(document => document.recordId)
  const { data, error } = recordIds.length === 0
    ? { data: [], error: null }
    : await supabase.from('expenses').select('flowaccount_record_id').in('flowaccount_record_id', recordIds)
  if (error) throw new Error(error.message)
  const existingIds = new Set<number>((data ?? []).map(row => Number(row.flowaccount_record_id)))
  const pending = selectImportCandidates(documents, existingIds)
  const paymentSlips = new Set(pending.flatMap(document =>
    document.referencedToMe?.map(reference => reference.documentSerial).filter(Boolean) ?? [],
  ))
  return {
    sourceDocuments: documents.length,
    existingDocuments: existingIds.size,
    pendingDocuments: pending.length,
    pendingPaymentSlips: paymentSlips.size,
    pendingTotalSatang: pending.reduce((sum, document) => sum + Math.round(Number(document.grandTotal ?? 0) * 100), 0),
  }
}

export async function syncFlowAccountPaymentSlips(supabase: SupabaseClient) {
  const documents = await fetchPaymentSlipExpenses()
  const categories = await categoryMap(supabase)
  let created = 0
  let updated = 0
  const errors: Array<{ recordId: number; documentSerial: string; error: string }> = []

  for (const document of documents) {
    try {
      const mapped = mapFlowAccountExpense(document, categories)
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('flowaccount_record_id', document.recordId)
        .maybeSingle()

      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .upsert(mapped.expense, { onConflict: 'flowaccount_record_id' })
        .select('id')
        .single()
      if (expenseError || !expense) throw new Error(expenseError?.message || 'บันทึกรายจ่ายไม่สำเร็จ')

      if (mapped.items.length > 0) {
        const { error: itemError } = await supabase.from('expense_items').upsert(
          mapped.items.map(item => ({ ...item, expense_id: expense.id })),
          { onConflict: 'expense_id,sort_order' },
        )
        if (itemError) throw new Error(itemError.message)
      }
      const { error: staleItemsError } = await supabase
        .from('expense_items')
        .delete()
        .eq('expense_id', expense.id)
        .gte('sort_order', mapped.items.length)
      if (staleItemsError) throw new Error(staleItemsError.message)

      if (existing) updated += 1
      else created += 1
    } catch (error: unknown) {
      errors.push({
        recordId: document.recordId,
        documentSerial: document.documentSerial,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    ok: errors.length === 0,
    sourceDocuments: documents.length,
    created,
    updated,
    errors,
    syncedAt: new Date().toISOString(),
  }
}
