import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApprovedJournal, createCashInvoice, getCashInvoice, getChartOfAccounts, voidCashInvoice,
} from './flowaccount'
import {
  expectedEdcDates, isExpectedEdcReport, selectSingleEdcCsvAttachment,
  replaceEdcCashSaleForTaxInvoice, syncEdcReportToFlowAccount,
} from './linePayEdcImport'

vi.mock('./flowaccount', () => ({
  createApprovedJournal: vi.fn(), createCashInvoice: vi.fn(), getCashInvoice: vi.fn(),
  getChartOfAccounts: vi.fn(), getJournalEntry: vi.fn(), voidCashInvoice: vi.fn(), voidJournalEntry: vi.fn(),
}))

type SyncRow = Record<string, unknown> & { id: string }

function makeSyncSupabase(report: SyncRow, revenueDays: SyncRow[]) {
  const contributionRows = revenueDays.map(day => ({ revenue_day_id: day.id }))
  function update(table: string, values: Record<string, unknown>) {
    const filters: Array<[string, unknown]> = []
    const chain = {
      eq(field: string, value: unknown) { filters.push([field, value]); return chain },
      is(field: string, value: unknown) { filters.push([field, value]); return chain },
      in() { return chain },
      select() { return chain },
      async maybeSingle() {
        const rows = table === 'linepay_edc_reports' ? [report] : revenueDays
        const row = rows.find(candidate => filters.every(([field, value]) => candidate[field] === value))
        if (row) Object.assign(row, values)
        return { data: row ?? null, error: null }
      },
    }
    return chain
  }
  return {
    rpc: async () => ({ data: { default_edc_channel_id: 87478, default_edc_channel_name: 'EDC - 88122653' }, error: null }),
    from: (table: string) => ({
      select: () => table === 'linepay_edc_reports' ? {
        eq: () => ({ eq: () => ({ single: async () => ({ data: report, error: null }) }) }),
      } : table === 'linepay_edc_report_revenue_days' ? {
        eq: () => ({ eq: async () => ({ data: contributionRows, error: null }) }),
      } : {
        in: () => ({ eq: () => ({ order: async () => ({ data: revenueDays, error: null }) }) }),
      },
      update: (values: Record<string, unknown>) => update(table, values),
    }),
  }
}

describe('LINE Pay EDC import schedule', () => {
  beforeEach(() => vi.clearAllMocks())

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
      settlement_record_id: 20, settlement_document_serial: 'JV2026080020', settlement_sync_state: 'synced',
      settlement_cleanup_record_id: null,
    }
    const revenueDays = [{
      id: 'day-0', report_id: report.id, revenue_date: '2026-08-23', gross_amount_satang: 100_000,
      cash_sale_record_id: 9, cash_sale_document_serial: 'CA2026080009', cash_sale_sync_state: 'synced',
      cash_sale_synced_amount_satang: 100_000, cash_sale_cleanup_record_id: null,
    }, {
      id: 'day-1', report_id: report.id, revenue_date: '2026-08-24', gross_amount_satang: 945_100,
      cash_sale_record_id: 10, cash_sale_document_serial: 'CA2026080010', cash_sale_sync_state: 'synced',
      cash_sale_synced_amount_satang: 945_100, cash_sale_cleanup_record_id: null,
    }]
    const supabase = {
      from: (table: string) => table === 'linepay_edc_reports' ? {
        select: () => ({
          eq: () => ({ eq: () => ({ single: async () => ({ data: report, error: null }) }) }),
        }),
      } : table === 'linepay_edc_report_revenue_days' ? {
        select: () => ({
          eq: () => ({ eq: async () => ({ data: revenueDays.map(day => ({ revenue_day_id: day.id })), error: null }) }),
        }),
      } : {
        select: () => ({
          in: () => ({ eq: () => ({ order: async () => ({ data: revenueDays, error: null }) }) }),
        }),
      },
    }

    await expect(syncEdcReportToFlowAccount(supabase as never, report.id)).resolves.toEqual({
      ok: true,
      cashSales: [
        { revenueDate: '2026-08-23', recordId: 9, documentSerial: 'CA2026080009', created: false },
        { revenueDate: '2026-08-24', recordId: 10, documentSerial: 'CA2026080010', created: false },
      ],
      settlement: { recordId: 20, documentSerial: 'JV2026080020', created: false },
    })
    expect(createCashInvoice).not.toHaveBeenCalled()
    expect(createApprovedJournal).not.toHaveBeenCalled()
  })

  it('creates one Cash Sale per aggregate sale date and one settlement JV for the report total', async () => {
    vi.mocked(getChartOfAccounts).mockResolvedValue([
      { id: 1, code: '11121.01', category: '', nameLocal: 'KBank 1608755558', nameForeign: '' },
      { id: 2, code: '53212', category: '', nameLocal: 'ค่าธรรมเนียมบัตรเครดิต', nameForeign: '' },
      { id: 3, code: '17115', category: '', nameLocal: 'ภาษีซื้อรอใบกำกับ', nameForeign: '' },
      { id: 4, code: '11379.01', category: '', nameLocal: 'EDC 88122653', nameForeign: '' },
    ])
    vi.mocked(createCashInvoice)
      .mockResolvedValueOnce({ recordId: 101, documentSerial: 'CA-1' })
      .mockResolvedValueOnce({ recordId: 102, documentSerial: 'CA-2' })
    vi.mocked(createApprovedJournal).mockResolvedValue({ recordId: 201, documentSerial: 'JV-1' })
    const report: SyncRow = {
      id: 'report-new', settlement_date: '2026-08-12', gross_amount_satang: 4_079_300,
      fee_amount_satang: 92_552, fee_vat_satang: 6_480, net_amount_satang: 3_980_268,
      settlement_record_id: null, settlement_document_serial: null,
      settlement_sync_state: 'idle', settlement_cleanup_record_id: null,
    }
    const days: SyncRow[] = [
      { id: 'day-10', revenue_date: '2026-08-10', gross_amount_satang: 2_411_900,
        full_tax_invoice_satang: 300_400,
        cash_sale_record_id: null, cash_sale_document_serial: null, cash_sale_synced_amount_satang: null,
        cash_sale_sync_state: 'idle', cash_sale_cleanup_record_id: null },
      { id: 'day-11', revenue_date: '2026-08-11', gross_amount_satang: 1_667_400,
        cash_sale_record_id: null, cash_sale_document_serial: null, cash_sale_synced_amount_satang: null,
        cash_sale_sync_state: 'idle', cash_sale_cleanup_record_id: null },
    ]

    const result = await syncEdcReportToFlowAccount(makeSyncSupabase(report, days) as never, report.id)
    if (!result.ok) throw new Error(result.error)

    expect(result).toMatchObject({ ok: true, cashSales: [
      { revenueDate: '2026-08-10', documentSerial: 'CA-1' },
      { revenueDate: '2026-08-11', documentSerial: 'CA-2' },
    ], settlement: { documentSerial: 'JV-1' } })
    expect(vi.mocked(createCashInvoice).mock.calls.map(([input]) => [input.publishedOn, input.items[0].pricePerUnit]))
      .toEqual([['2026-08-10', 19733.65], ['2026-08-11', 15583.18]])
    expect(vi.mocked(createCashInvoice).mock.calls[0][0].payment?.roundingAmount).toBe(0.01)
    expect(createApprovedJournal).toHaveBeenCalledTimes(1)
  })

  it('voids and verifies an old Cash Sale before recreating a late-settlement aggregate', async () => {
    vi.mocked(getCashInvoice)
      .mockResolvedValueOnce({ isDelete: false, statusString: 'paid' })
      .mockResolvedValueOnce({ isDelete: true, statusString: 'void' })
    vi.mocked(voidCashInvoice).mockResolvedValue({})
    vi.mocked(createCashInvoice).mockResolvedValue({ recordId: 103, documentSerial: 'CA-NEW' })
    const report: SyncRow = {
      id: 'report-late', settlement_date: '2026-08-10', gross_amount_satang: 2_275_900,
      fee_amount_satang: 54_775, fee_vat_satang: 3_834, net_amount_satang: 2_217_291,
      settlement_record_id: 202, settlement_document_serial: 'JV-EXISTING',
      settlement_sync_state: 'synced', settlement_cleanup_record_id: null,
    }
    const day: SyncRow = {
      id: 'day-08', revenue_date: '2026-08-08', gross_amount_satang: 2_560_600,
      cash_sale_record_id: 90, cash_sale_document_serial: 'CA-OLD',
      cash_sale_synced_amount_satang: 2_213_700, cash_sale_sync_state: 'replacing',
      cash_sale_cleanup_record_id: 90,
    }

    const result = await syncEdcReportToFlowAccount(makeSyncSupabase(report, [day]) as never, report.id)
    if (!result.ok) throw new Error(result.error)

    expect(voidCashInvoice).toHaveBeenCalledWith(90)
    expect(getCashInvoice).toHaveBeenCalledTimes(2)
    expect(result.cashSales[0]).toMatchObject({ revenueDate: '2026-08-08', documentSerial: 'CA-NEW', created: true })
    expect(day).toMatchObject({ cash_sale_record_id: 103, cash_sale_document_serial: 'CA-NEW',
      cash_sale_synced_amount_satang: 2_560_600, cash_sale_sync_state: 'synced' })
  })

  it('replaces an EDC Cash Sale with the amount left after full tax invoices', async () => {
    vi.mocked(getCashInvoice)
      .mockResolvedValueOnce({ isDelete: false, statusString: 'paid' })
      .mockResolvedValueOnce({ isDelete: true, statusString: 'void' })
    vi.mocked(voidCashInvoice).mockResolvedValue({})
    vi.mocked(createCashInvoice).mockResolvedValue({ recordId: 104, documentSerial: 'CA-NET' })
    const day: SyncRow = {
      id: 'day-tax', revenue_date: '2026-08-23', gross_amount_satang: 2_427_100,
      full_tax_invoice_satang: 447_400,
      cash_sale_record_id: 90, cash_sale_document_serial: 'CA-GROSS',
      cash_sale_synced_amount_satang: 2_427_100, cash_sale_sync_state: 'synced',
      cash_sale_cleanup_record_id: null,
    }
    const supabase = makeSyncSupabase({ id: 'unused' }, [day])

    const result = await replaceEdcCashSaleForTaxInvoice(supabase as never, day as never)

    expect(voidCashInvoice).toHaveBeenCalledWith(90)
    expect(result).toMatchObject({ revenueDate: '2026-08-23', recordId: 104, documentSerial: 'CA-NET' })
    expect(day).toMatchObject({ cash_sale_synced_amount_satang: 1_979_700, cash_sale_sync_state: 'synced' })
  })
})
