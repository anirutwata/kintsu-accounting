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

async function fetchFlowAccountExpenses(endDate = todayBkk()): Promise<FlowAccountExpenseDocument[]> {
  const pageSize = 200
  const first = await listFlowAccountExpenses(FLOWACCOUNT_IMPORT_START_DATE, endDate, 1, pageSize)
  const documents = [...first.list] as FlowAccountExpenseDocument[]
  const pages = Math.ceil(first.totalDocument / pageSize)
  for (let page = 2; page <= pages; page += 1) {
    const next = await listFlowAccountExpenses(FLOWACCOUNT_IMPORT_START_DATE, endDate, page, pageSize)
    documents.push(...next.list as FlowAccountExpenseDocument[])
  }
  return documents
}

async function categoryMap(supabase: SupabaseClient): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('name, flowaccount_debit_id')
    .eq('category_type', 'expense')
    .eq('is_active', true)
    .not('flowaccount_debit_id', 'is', null)
  if (error) throw new Error(error.message)
  const result = new Map((data ?? []).map(row => [Number(row.flowaccount_debit_id), String(row.name)]))
  const { data: aliases, error: aliasError } = await supabase
    .from('flowaccount_expense_category_aliases')
    .select('debit_id, category')
  if (aliasError) throw new Error(aliasError.message)
  for (const alias of aliases ?? []) result.set(Number(alias.debit_id), String(alias.category))
  return result
}

function normalizeVendor(value: string | null | undefined): string {
  return (value || '').replace(/บริษัท|จำกัด|\(มหาชน\)|\s+/g, '').toLowerCase()
}

export async function previewFlowAccountPaymentSlipSync(supabase: SupabaseClient) {
  const rawDocuments = await fetchFlowAccountExpenses()
  const documents = selectImportCandidates(rawDocuments, new Set())
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
  const rawDocuments = await fetchFlowAccountExpenses()
  const documents = selectImportCandidates(rawDocuments, new Set())
  const activeRecordIds = new Set(documents.map(document => document.recordId))
  const categories = await categoryMap(supabase)
  let created = 0
  let updated = 0
  let linked = 0
  let deactivated = 0
  const errors: Array<{ recordId: number; documentSerial: string; error: string }> = []

  for (const document of documents) {
    try {
      const mapped = mapFlowAccountExpense(document, categories)
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('flowaccount_record_id', document.recordId)
        .maybeSingle()

      let linkedLocalId: string | null = null
      if (!existing) {
        const { data: possibleDuplicates, error: duplicateError } = await supabase
          .from('expenses')
          .select('id, recipient_name')
          .neq('source', 'flowaccount_payment_slip')
          .eq('is_deleted', false)
          .eq('document_date', mapped.expense.document_date)
          .eq('total_satang', mapped.expense.total_satang)
        if (duplicateError) throw new Error(duplicateError.message)
        const exactVendorMatches = (possibleDuplicates ?? []).filter(row =>
          normalizeVendor(row.recipient_name) === normalizeVendor(mapped.expense.recipient_name),
        )
        if (exactVendorMatches.length > 1) throw new Error('พบรายการ KINTSU เดิมที่อาจซ้ำมากกว่า 1 รายการ')
        linkedLocalId = exactVendorMatches[0]?.id ?? null
      }

      const expenseQuery = linkedLocalId
        ? supabase.from('expenses').update(mapped.expense).eq('id', linkedLocalId)
        : supabase.from('expenses').upsert(mapped.expense, { onConflict: 'flowaccount_record_id' })
      const { data: expense, error: expenseError } = await expenseQuery.select('id').single()
      if (expenseError || !expense) throw new Error(expenseError?.message || 'บันทึกรายจ่ายไม่สำเร็จ')

      if (mapped.items.length > 0) {
        const { error: itemError } = await supabase.from('expense_items').upsert(
          mapped.items.map(item => ({ ...item, expense_id: expense.id, is_deleted: false, deleted_at: null })),
          { onConflict: 'expense_id,sort_order' },
        )
        if (itemError) throw new Error(itemError.message)
      }
      const { error: staleItemsError } = await supabase
        .from('expense_items')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('expense_id', expense.id)
        .gte('sort_order', mapped.items.length)
      if (staleItemsError) throw new Error(staleItemsError.message)

      if (linkedLocalId) linked += 1
      else if (existing) updated += 1
      else created += 1
    } catch (error: unknown) {
      errors.push({
        recordId: document.recordId,
        documentSerial: document.documentSerial,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { data: importedRows, error: importedError } = await supabase
    .from('expenses')
    .select('id, flowaccount_record_id')
    .eq('source', 'flowaccount_payment_slip')
    .eq('is_deleted', false)
  if (importedError) throw new Error(importedError.message)
  const rawRecordIds = new Set(rawDocuments.map(document => document.recordId))
  for (const row of importedRows ?? []) {
    const recordId = Number(row.flowaccount_record_id)
    if (rawRecordIds.has(recordId) && !activeRecordIds.has(recordId)) {
      const raw = rawDocuments.find(document => document.recordId === recordId)
      const { error } = await supabase.from('expenses').update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        flowaccount_payment_status: raw?.statusString || String(raw?.status || 'removedFromPaymentSlip'),
        flowaccount_synced_at: new Date().toISOString(),
      }).eq('id', row.id)
      if (error) throw new Error(error.message)
      deactivated += 1
    }
  }

  return {
    ok: errors.length === 0,
    sourceDocuments: documents.length,
    created,
    updated,
    linked,
    deactivated,
    errors,
    syncedAt: new Date().toISOString(),
  }
}
