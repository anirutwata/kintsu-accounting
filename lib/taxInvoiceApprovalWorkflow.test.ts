import { describe, expect, it, vi } from 'vitest'
import { runTaxInvoiceApprovalAccounting, type TaxInvoiceApprovalRecord } from './taxInvoiceApprovalWorkflow'

function request(overrides: Partial<TaxInvoiceApprovalRecord> = {}): TaxInvoiceApprovalRecord {
  return {
    id: '12345678-aaaa-bbbb-cccc-123456789012', document_date: '2026-08-23',
    payment_method: 'cash', total_satang: 146_900,
    dedup_action: 'reversal_journal', dedup_state: 'reserved',
    flowaccount_record_id: null, flowaccount_document_serial: null,
    dedup_correction_record_id: null, dedup_correction_document_serial: null,
    dedup_original_record_id: null, dedup_original_document_serial: null,
    ...overrides,
  }
}

function dependencies(record: TaxInvoiceApprovalRecord) {
  return {
    reserve: vi.fn(async () => ({ ...record })),
    createInvoice: vi.fn(async () => ({ recordId: 100, documentSerial: 'INV-1' })),
    saveInvoice: vi.fn(async (_id: string, invoice: { recordId: number; documentSerial: string }) => {
      record.flowaccount_record_id = invoice.recordId
      record.flowaccount_document_serial = invoice.documentSerial
      record.dedup_state = 'invoice_created'
      return { ...record }
    }),
    voidInvoice: vi.fn(async () => undefined),
    createReversal: vi.fn(async () => ({ recordId: 200, documentSerial: 'JV-1' })),
    saveCorrection: vi.fn(async (_id: string, correction: { recordId: number; documentSerial: string }) => {
      record.dedup_correction_record_id = correction.recordId
      record.dedup_correction_document_serial = correction.documentSerial
      record.dedup_state = 'accounting_complete'
    }),
    voidCorrection: vi.fn(async () => undefined),
    replaceEdcCashSale: vi.fn(async () => ({ recordId: 300, documentSerial: 'CA-NET' })),
    markComplete: vi.fn(async () => { record.dedup_state = 'complete' }),
  }
}

describe('runTaxInvoiceApprovalAccounting', () => {
  it('stops before document creation when accounting review is required', async () => {
    const row = request({ dedup_action: 'manual_review_closed_vat_period', dedup_state: 'manual_review' })
    const deps = dependencies(row)

    await expect(runTaxInvoiceApprovalAccounting(row.id, deps)).resolves.toEqual({
      ok: false, manualReview: true, action: 'manual_review_closed_vat_period',
    })
    expect(deps.createInvoice).not.toHaveBeenCalled()
  })

  it('creates a paid invoice and its cash reversal exactly once across a retry', async () => {
    const row = request()
    const deps = dependencies(row)

    await expect(runTaxInvoiceApprovalAccounting(row.id, deps)).resolves.toMatchObject({
      ok: true, invoice: { documentSerial: 'INV-1' }, correction: { documentSerial: 'JV-1' },
    })
    await expect(runTaxInvoiceApprovalAccounting(row.id, deps)).resolves.toMatchObject({ ok: true })

    expect(deps.createInvoice).toHaveBeenCalledTimes(1)
    expect(deps.createReversal).toHaveBeenCalledTimes(1)
    expect(deps.markComplete).toHaveBeenCalledTimes(1)
  })

  it('replaces the EDC Cash Sale after creating the full tax invoice', async () => {
    const row = request({ payment_method: 'credit_card', dedup_action: 'replace_edc_cash_sale' })
    const deps = dependencies(row)

    await expect(runTaxInvoiceApprovalAccounting(row.id, deps)).resolves.toMatchObject({
      ok: true, invoice: { documentSerial: 'INV-1' }, correction: { documentSerial: 'CA-NET' },
    })
    expect(deps.replaceEdcCashSale).toHaveBeenCalledTimes(1)
    expect(deps.createReversal).not.toHaveBeenCalled()
  })

  it('creates only the invoice when a future cash or TTB JV will be netted', async () => {
    const row = request({ dedup_action: 'reduce_future_revenue_journal' })
    const deps = dependencies(row)

    await expect(runTaxInvoiceApprovalAccounting(row.id, deps)).resolves.toMatchObject({
      ok: true, invoice: { documentSerial: 'INV-1' }, correction: null,
    })
    expect(deps.createReversal).not.toHaveBeenCalled()
    expect(deps.replaceEdcCashSale).not.toHaveBeenCalled()
  })

  it('voids a newly-created invoice if its record cannot be saved for idempotent retry', async () => {
    const row = request()
    const deps = dependencies(row)
    deps.saveInvoice.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(runTaxInvoiceApprovalAccounting(row.id, deps)).rejects.toThrow('database unavailable')
    expect(deps.voidInvoice).toHaveBeenCalledWith(100)
    expect(deps.createReversal).not.toHaveBeenCalled()
  })
})
