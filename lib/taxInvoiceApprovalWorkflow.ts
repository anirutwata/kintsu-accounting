import type { TaxInvoiceDedupAction, TaxInvoicePaymentMethod } from './taxInvoiceDedupPolicy'

export interface TaxInvoiceApprovalRecord {
  id: string
  document_date: string
  payment_method: TaxInvoicePaymentMethod
  total_satang: number
  dedup_action: TaxInvoiceDedupAction | 'manual_review_historical_documents' | 'manual_review_edc_pool_exceeded' | null
  dedup_state: string
  flowaccount_record_id: number | null
  flowaccount_document_serial: string | null
  dedup_correction_record_id: number | null
  dedup_correction_document_serial: string | null
  dedup_original_record_id: number | null
  dedup_original_document_serial: string | null
}

export interface TaxInvoiceDocumentRef {
  recordId: number
  documentSerial: string
}

export interface TaxInvoiceApprovalDependencies {
  reserve(requestId: string): Promise<TaxInvoiceApprovalRecord>
  createInvoice(request: TaxInvoiceApprovalRecord): Promise<TaxInvoiceDocumentRef>
  saveInvoice(requestId: string, invoice: TaxInvoiceDocumentRef): Promise<TaxInvoiceApprovalRecord>
  voidInvoice(recordId: number): Promise<void>
  createReversal(request: TaxInvoiceApprovalRecord, invoice: TaxInvoiceDocumentRef): Promise<TaxInvoiceDocumentRef>
  saveCorrection(requestId: string, correction: TaxInvoiceDocumentRef): Promise<void>
  voidCorrection(recordId: number): Promise<void>
  replaceEdcCashSale(request: TaxInvoiceApprovalRecord): Promise<TaxInvoiceDocumentRef | null>
  markComplete(requestId: string): Promise<void>
}

function existingInvoice(request: TaxInvoiceApprovalRecord): TaxInvoiceDocumentRef | null {
  return request.flowaccount_record_id && request.flowaccount_document_serial
    ? { recordId: request.flowaccount_record_id, documentSerial: request.flowaccount_document_serial }
    : null
}

function existingCorrection(request: TaxInvoiceApprovalRecord): TaxInvoiceDocumentRef | null {
  return request.dedup_correction_record_id && request.dedup_correction_document_serial
    ? { recordId: request.dedup_correction_record_id, documentSerial: request.dedup_correction_document_serial }
    : null
}

export async function runTaxInvoiceApprovalAccounting(
  requestId: string,
  dependencies: TaxInvoiceApprovalDependencies,
) {
  let request = await dependencies.reserve(requestId)
  if (request.dedup_state === 'manual_review' || request.dedup_action?.startsWith('manual_review')) {
    return { ok: false as const, manualReview: true as const, action: request.dedup_action }
  }
  const storedInvoice = existingInvoice(request)
  const storedCorrection = existingCorrection(request)
  if (request.dedup_state === 'complete') {
    if (!storedInvoice) throw new Error('สถานะใบกำกับภาษี complete แต่ไม่มี FlowAccount record ID')
    return { ok: true as const, invoice: storedInvoice, correction: storedCorrection, created: false, pendingReconciliation: false }
  }

  let invoice = storedInvoice
  if (!invoice) {
    invoice = await dependencies.createInvoice(request)
    try {
      request = await dependencies.saveInvoice(request.id, invoice)
    } catch (error) {
      await dependencies.voidInvoice(invoice.recordId)
      throw error
    }
  }

  let correction = storedCorrection
  // The LINE Pay EDC settlement report always lags a day behind the sale, so a
  // credit_card invoice requested before it arrives has no pool to reconcile
  // against yet. The invoice still ships to the customer now; reconcile_pending_edc_tax_invoices
  // finishes the allocation once the report lands, so this action does not mark complete.
  const pendingReconciliation = request.dedup_action === 'pending_edc_report'
  if (!correction && request.dedup_action === 'reversal_journal') {
    correction = await dependencies.createReversal(request, invoice)
    try {
      await dependencies.saveCorrection(request.id, correction)
    } catch (error) {
      await dependencies.voidCorrection(correction.recordId)
      throw error
    }
  } else if (!correction && request.dedup_action === 'replace_edc_cash_sale') {
    correction = await dependencies.replaceEdcCashSale(request)
    if (correction) await dependencies.saveCorrection(request.id, correction)
  } else if (!pendingReconciliation
    && request.dedup_action !== 'reduce_future_edc_cash_sale'
    && request.dedup_action !== 'reduce_future_revenue_journal'
    && request.dedup_action !== 'reversal_journal'
    && request.dedup_action !== 'replace_edc_cash_sale') {
    throw new Error(`ไม่รู้จักวิธีป้องกันรายได้ซ้ำ: ${request.dedup_action}`)
  }

  if (!pendingReconciliation) await dependencies.markComplete(request.id)
  return { ok: true as const, invoice, correction, created: !storedInvoice, pendingReconciliation }
}
