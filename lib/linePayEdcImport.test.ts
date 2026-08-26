import { describe, expect, it, vi } from 'vitest'
import { createApprovedJournal, createCashInvoice } from './flowaccount'
import {
  expectedEdcDates, isExpectedEdcReport, selectSingleEdcCsvAttachment,
  syncEdcReportToFlowAccount,
} from './linePayEdcImport'

vi.mock('./flowaccount', () => ({
  createApprovedJournal: vi.fn(), createCashInvoice: vi.fn(), getCashInvoice: vi.fn(),
  getChartOfAccounts: vi.fn(), getJournalEntry: vi.fn(), voidCashInvoice: vi.fn(), voidJournalEntry: vi.fn(),
}))

describe('LINE Pay EDC import schedule', () => {
  it('expects today settlement and D-1 revenue in Asia/Bangkok', () => {
    expect(expectedEdcDates(Date.UTC(2026, 7, 26, 5, 0, 0))).toEqual({
      revenueDate: '2026-08-25',
      settlementDate: '2026-08-26',
    })
  })

  it('skips an older valid attachment while looking for the current report', () => {
    expect(isExpectedEdcReport(
      { revenueDate: '2026-08-24', settlementDate: '2026-08-25' },
      { revenueDate: '2026-08-25', settlementDate: '2026-08-26' },
    )).toBe(false)
    expect(isExpectedEdcReport(
      { revenueDate: '2026-08-25', settlementDate: '2026-08-26' },
      { revenueDate: '2026-08-25', settlementDate: '2026-08-26' },
    )).toBe(true)
  })

  it('requires exactly one CSV attachment per LINE Pay email', () => {
    expect(selectSingleEdcCsvAttachment([
      { filename: 'EDC_DailyReport_20260825.csv', content: Buffer.from('one') },
    ])?.filename).toBe('EDC_DailyReport_20260825.csv')
    expect(() => selectSingleEdcCsvAttachment([])).toThrow('ต้องมีไฟล์ CSV เดียว')
    expect(() => selectSingleEdcCsvAttachment([
      { filename: 'one.csv', content: Buffer.from('one') },
      { filename: 'two.csv', content: Buffer.from('two') },
    ])).toThrow('ต้องมีไฟล์ CSV เดียว')
  })

  it('returns both existing FlowAccount documents without creating duplicates', async () => {
    const report = {
      id: 'report-1', revenue_date: '2026-08-24', settlement_date: '2026-08-25',
      gross_amount_satang: 945_100, fee_amount_satang: 23_891,
      fee_vat_satang: 1_673, net_amount_satang: 919_536,
      cash_sale_record_id: 10, cash_sale_document_serial: 'CA2026080010', cash_sale_sync_state: 'synced',
      cash_sale_cleanup_record_id: null,
      settlement_record_id: 20, settlement_document_serial: 'JV2026080020', settlement_sync_state: 'synced',
      settlement_cleanup_record_id: null,
    }
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ single: async () => ({ data: report, error: null }) }) }),
        }),
      }),
    }

    await expect(syncEdcReportToFlowAccount(supabase as never, report.id)).resolves.toEqual({
      ok: true,
      cashSale: { recordId: 10, documentSerial: 'CA2026080010', created: false },
      settlement: { recordId: 20, documentSerial: 'JV2026080020', created: false },
    })
    expect(createCashInvoice).not.toHaveBeenCalled()
    expect(createApprovedJournal).not.toHaveBeenCalled()
  })
})
