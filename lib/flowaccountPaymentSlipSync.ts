import { listFlowAccountExpenses, getExpenseDocument } from './flowaccount'
import {
  mapFlowAccountExpense,
  selectImportCandidates,
  needsPaymentSlipLookup,
  isPaidStatus,
  type FlowAccountExpenseDocument,
} from './flowaccountExpenseImport'
import type { SupabaseClient } from '@supabase/supabase-js'

export const FLOWACCOUNT_IMPORT_START_DATE = '2026-06-01'

// Detail fetches are sequential (FlowAccount rate-limits, Vercel Hobby caps a run at 300 s), so a big
// backlog is worked off a slice per run. Unresolved docs are just not candidates yet — never deactivated.
export const MAX_DETAIL_LOOKUPS_PER_RUN = 60

function todayBkk(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function daysAgoBkk(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

async function fetchFlowAccountExpenses(startDate = FLOWACCOUNT_IMPORT_START_DATE, endDate = todayBkk()): Promise<FlowAccountExpenseDocument[]> {
  const pageSize = 200
  const first = await listFlowAccountExpenses(startDate, endDate, 1, pageSize)
  const documents = [...first.list] as FlowAccountExpenseDocument[]
  const pages = Math.ceil(first.totalDocument / pageSize)
  for (let page = 2; page <= pages; page += 1) {
    const next = await listFlowAccountExpenses(startDate, endDate, page, pageSize)
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

type LocalCandidate = { id: string; recipient_name: string | null; flowaccount_record_id: number | null; flowaccount_synced_at: string | null }

// Decides what to do with a PAY document that has no local row by record id, given the live
// local (non-PAY, not deleted) rows with the same document_date + total_satang.
// - Any such row with a create claim (synced_at set, record_id null — in flight OR locked by an
//   ambiguous failure) → skip: that create may be producing THIS document; inserting a row now
//   would take its record id (unique index) and the create could never save it. Vendor is not
//   compared here on purpose — the FlowAccount contact name can differ from recipient_name.
//   Sufficient because the claim is set BEFORE createExpense and the document list is fetched
//   before this lookup: if this document came from a local create, at lookup time that row is
//   either still claimed (skip) or already holds the record id (found as `existing`).
// - Rows with their own record id are another FlowAccount document → never linked/overwritten.
// - Otherwise link the single unclaimed exact-vendor match, or insert a new row (no match).
// Known low-risk limitation: candidates are only pre-filtered by exact date + total (by the caller);
// two same-day same-total rows with different vendors fall to the vendor check below.
export function pickLocalMatch(rows: LocalCandidate[], vendor: string | null | undefined): { skip: true } | { skip: false; linkId: string | null } {
  if (rows.some(row => row.flowaccount_synced_at && !row.flowaccount_record_id)) return { skip: true }
  const matches = rows.filter(row => !row.flowaccount_record_id && !row.flowaccount_synced_at && normalizeVendor(row.recipient_name) === normalizeVendor(vendor))
  if (matches.length > 1) throw new Error('พบรายการ KINTSU เดิมที่อาจซ้ำมากกว่า 1 รายการ')
  return { skip: false, linkId: matches[0]?.id ?? null }
}

// The bulk /expenses list drops referencedToMe, so a pendingPayment/paidByPaymentSlip
// (or since-cancelled) document doesn't carry which PAY (ใบเตรียมจ่าย) it belongs to.
// Backfill it: reuse the PAY serial already stored locally for a document we've
// imported before (no API call), otherwise re-fetch that one document's detail,
// which does return referencedToMe.
export async function withPaymentSlipReferences(
  supabase: SupabaseClient,
  documents: FlowAccountExpenseDocument[],
): Promise<FlowAccountExpenseDocument[]> {
  const needsLookup = documents.filter(document =>
    needsPaymentSlipLookup(document) && !(document.referencedToMe?.length),
  )
  if (needsLookup.length === 0) return documents

  const recordIds = needsLookup.map(document => document.recordId)
  const { data, error } = await supabase
    .from('expenses')
    .select('flowaccount_record_id, flowaccount_payment_slip_serial')
    .in('flowaccount_record_id', recordIds)
  if (error) throw new Error(error.message)
  const knownSerialByRecordId = new Map<number, string>(
    (data ?? [])
      .filter(row => row.flowaccount_payment_slip_serial)
      .map(row => [Number(row.flowaccount_record_id), String(row.flowaccount_payment_slip_serial)]),
  )

  const enrichedByRecordId = new Map<number, FlowAccountExpenseDocument>()
  let fetched = 0
  for (const document of needsLookup) {
    const knownSerial = knownSerialByRecordId.get(document.recordId)
    if (knownSerial) {
      enrichedByRecordId.set(document.recordId, {
        ...document,
        referencedToMe: [{ documentType: '37', documentSerial: knownSerial }],
      })
      continue
    }
    if (fetched >= MAX_DETAIL_LOOKUPS_PER_RUN) continue // picked up by a later run
    fetched += 1
    try {
      const detail = await getExpenseDocument(document.recordId) as FlowAccountExpenseDocument
      enrichedByRecordId.set(document.recordId, { ...document, referencedToMe: detail.referencedToMe })
    } catch {
      // one failing document (or a rate limit) must not abort the whole run; retried next run
    }
  }

  return documents.map(document => enrichedByRecordId.get(document.recordId) ?? document)
}

export async function previewFlowAccountPaymentSlipSync(supabase: SupabaseClient) {
  const rawDocuments = await fetchFlowAccountExpenses()
  const enrichedDocuments = await withPaymentSlipReferences(supabase, rawDocuments)
  const documents = selectImportCandidates(enrichedDocuments, new Set())
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

// sinceDays limits the FlowAccount fetch window (by document date) for the on-page Sync button; the
// nightly cron passes nothing = everything since the import start. Reconcile and the paid bulk-mark only
// touch rows whose documents are in the fetched window, so a short window never deactivates older rows.
export async function syncFlowAccountPaymentSlips(supabase: SupabaseClient, options: { sinceDays?: number } = {}) {
  const start = options.sinceDays
    ? [FLOWACCOUNT_IMPORT_START_DATE, daysAgoBkk(options.sinceDays)].sort().at(-1)!
    : FLOWACCOUNT_IMPORT_START_DATE
  const rawDocuments = await fetchFlowAccountExpenses(start)
  // Runs before the (slow, per-document) PAY enrichment so a PAY backlog/failure can't block it.
  // Own expenses paid in FlowAccount (directly or via PAY) → mirror as paid so the
  // "ยังไม่ชำระ" filter is right without anyone opening each row. Uses the list we already have.
  const paidIds = rawDocuments.filter(d => !d.isDelete && isPaidStatus(d)).map(d => d.recordId)
  let markedPaid = 0
  const nowIso = new Date().toISOString()
  for (let i = 0; i < paidIds.length; i += 200) {
    const { data, error } = await supabase.from('expenses')
      .update({ flowaccount_paid_at: nowIso })
      .in('flowaccount_record_id', paidIds.slice(i, i + 200))
      .neq('source', 'flowaccount_payment_slip')
      .is('flowaccount_paid_at', null)
      .eq('is_deleted', false)
      .select('id')
    if (error) throw new Error(error.message)
    markedPaid += data?.length ?? 0
  }

  const enrichedDocuments = await withPaymentSlipReferences(supabase, rawDocuments)
  const documents = selectImportCandidates(enrichedDocuments, new Set())
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
      const { data: existing, error: existingError } = await supabase
        .from('expenses')
        .select('id, source, is_deleted')
        .eq('flowaccount_record_id', document.recordId)
        .maybeSingle()
      if (existingError) throw new Error(existingError.message)
      // A locally deleted own expense must not be resurrected/re-sourced by the import.
      if (existing?.is_deleted && existing.source !== 'flowaccount_payment_slip') {
        throw new Error('รายการนี้ถูกลบในระบบแล้วแต่เอกสารยังอยู่ใน FlowAccount — ข้ามการนำเข้า กรุณาตรวจ/ลบใน FlowAccount')
      }

      let linkedLocalId: string | null = null
      if (!existing) {
        const { data: possibleDuplicates, error: duplicateError } = await supabase
          .from('expenses')
          .select('id, recipient_name, flowaccount_record_id, flowaccount_synced_at')
          .neq('source', 'flowaccount_payment_slip')
          .eq('is_deleted', false)
          .eq('document_date', mapped.expense.document_date)
          .eq('total_satang', mapped.expense.total_satang)
        if (duplicateError) throw new Error(duplicateError.message)
        const decision = pickLocalMatch(possibleDuplicates ?? [], mapped.expense.recipient_name)
        if (decision.skip) {
          throw new Error('มีรายการ KINTSU ยอด/วันที่เดียวกันกำลังส่ง (หรือค้าง) เข้า FlowAccount — ข้ามรอบนี้ จะนำเข้ารอบถัดไป ถ้าค้างนานให้ตรวจด้วยตนเอง')
        }
        linkedLocalId = decision.linkId
      }

      const expenseQuery = linkedLocalId
        // Same conditions re-checked atomically in the UPDATE: a create claimed (or a delete)
        // after the lookup wins → 0 rows → error below, the next run re-decides.
        ? supabase.from('expenses').update(mapped.expense).eq('id', linkedLocalId)
          .eq('is_deleted', false).is('flowaccount_record_id', null).is('flowaccount_synced_at', null)
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
    markedPaid,
    sourceDocuments: documents.length,
    created,
    updated,
    linked,
    deactivated,
    errors,
    syncedAt: new Date().toISOString(),
  }
}
