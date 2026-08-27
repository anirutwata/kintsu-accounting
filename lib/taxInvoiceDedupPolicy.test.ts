import { describe, expect, it } from 'vitest'
import { planTaxInvoiceDedup } from './taxInvoiceDedupPolicy'

describe('planTaxInvoiceDedup', () => {
  it('uses a reversal journal for a cash receipt already included in daily revenue', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'cash', documentDate: '2026-08-24', today: '2026-08-27',
      totalSatang: 146_900, authoritativeSatang: 758_400, allocatedSatang: 0,
      sourceRevenueJournalExists: true, edcCashSaleExists: false,
    })).toEqual({ action: 'reversal_journal', remainingSatang: 611_500 })
  })

  it('uses a reversal journal for a TTB transfer receipt', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'transfer', documentDate: '2026-08-23', today: '2026-08-27',
      totalSatang: 163_400, authoritativeSatang: 2_500_000, allocatedSatang: 149_800,
      sourceRevenueJournalExists: true, edcCashSaleExists: false,
    })).toEqual({ action: 'reversal_journal', remainingSatang: 2_186_800 })
  })

  it('reduces the future cash JV when the source revenue has not been posted yet', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'cash', documentDate: '2026-08-27', today: '2026-08-27',
      totalSatang: 78_900, authoritativeSatang: 500_000, allocatedSatang: 0,
      sourceRevenueJournalExists: false, edcCashSaleExists: false,
    })).toEqual({ action: 'reduce_future_revenue_journal', remainingSatang: 421_100 })
  })

  it('reduces a future EDC Cash Sale when the daily document does not exist yet', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'credit_card', documentDate: '2026-08-27', today: '2026-08-27',
      totalSatang: 300_400, authoritativeSatang: 2_427_100, allocatedSatang: 147_000,
      sourceRevenueJournalExists: false, edcCashSaleExists: false,
    })).toEqual({ action: 'reduce_future_edc_cash_sale', remainingSatang: 1_979_700 })
  })

  it('replaces an existing EDC Cash Sale inside the current VAT month', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'credit_card', documentDate: '2026-08-23', today: '2026-08-27',
      totalSatang: 300_400, authoritativeSatang: 2_427_100, allocatedSatang: 147_000,
      sourceRevenueJournalExists: false, edcCashSaleExists: true,
    })).toEqual({ action: 'replace_edc_cash_sale', remainingSatang: 1_979_700 })
  })

  it('requires accounting review before changing an EDC tax document from a prior month', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'credit_card', documentDate: '2026-07-31', today: '2026-08-27',
      totalSatang: 107_000, authoritativeSatang: 900_000, allocatedSatang: 0,
      sourceRevenueJournalExists: false, edcCashSaleExists: true,
    })).toEqual({ action: 'manual_review_closed_vat_period', remainingSatang: 793_000 })
  })

  it('defers to pending_edc_report when the settlement report for today has not arrived yet', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'credit_card', documentDate: '2026-08-27', today: '2026-08-27',
      totalSatang: 158_500, authoritativeSatang: null, allocatedSatang: 0,
      sourceRevenueJournalExists: false, edcCashSaleExists: false,
    })).toEqual({ action: 'pending_edc_report', remainingSatang: null })
  })

  it('defers to pending_edc_report when yesterday\'s report has not been imported by cron yet', () => {
    expect(planTaxInvoiceDedup({
      paymentMethod: 'credit_card', documentDate: '2026-08-26', today: '2026-08-27',
      totalSatang: 158_500, authoritativeSatang: null, allocatedSatang: 0,
      sourceRevenueJournalExists: false, edcCashSaleExists: false,
    })).toEqual({ action: 'pending_edc_report', remainingSatang: null })
  })

  it('still rejects a missing EDC pool for an older date instead of deferring', () => {
    expect(() => planTaxInvoiceDedup({
      paymentMethod: 'credit_card', documentDate: '2026-08-20', today: '2026-08-27',
      totalSatang: 158_500, authoritativeSatang: null, allocatedSatang: 0,
      sourceRevenueJournalExists: false, edcCashSaleExists: false,
    })).toThrow('ยอดใบกำกับภาษีรวมเกินยอดEDCของวันที่ 2026-08-20')
  })

  it('rejects an allocation that exceeds the authoritative channel total', () => {
    expect(() => planTaxInvoiceDedup({
      paymentMethod: 'cash', documentDate: '2026-08-24', today: '2026-08-27',
      totalSatang: 146_900, authoritativeSatang: 200_000, allocatedSatang: 100_000,
      sourceRevenueJournalExists: false, edcCashSaleExists: false,
    })).toThrow('ยอดใบกำกับภาษีรวมเกินยอดเงินสดของวันที่ 2026-08-24')
  })
})
