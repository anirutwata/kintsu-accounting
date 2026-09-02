import { describe, expect, it } from 'vitest'
import { parseTaxInvoiceBillJson } from './billOcr'

function baseJson(overrides: Record<string, unknown> = {}) {
  return {
    date_found: true, date_day: 1, date_month: 9, date_year_ce: 2026,
    subtotal_found: true, subtotal_baht: 1268, total_found: true, total_baht: 1356,
    payment_method_found: true, payment_method: 'credit_card', confidence: 0.9,
    ...overrides,
  }
}

describe('parseTaxInvoiceBillJson', () => {
  it('assembles day/month/year fields into an ISO date without swapping day and month', () => {
    // A bill printed "01/09/2569" (Thai DD/MM/YYYY, Buddhist year) — day 1, month 9 (September).
    // The old single-string prompt let the model misread this as MM/DD (January 9); reading
    // day/month as separate labeled fields removes that ambiguity.
    const result = parseTaxInvoiceBillJson(baseJson({ date_day: 1, date_month: 9, date_year_ce: 2026 }))
    expect(result.documentDate).toBe('2026-09-01')
  })

  it('pads single-digit day and month', () => {
    const result = parseTaxInvoiceBillJson(baseJson({ date_day: 5, date_month: 3, date_year_ce: 2026 }))
    expect(result.documentDate).toBe('2026-03-05')
  })

  it('returns null documentDate when date_found is false', () => {
    const result = parseTaxInvoiceBillJson(baseJson({ date_found: false, date_day: null, date_month: null, date_year_ce: null }))
    expect(result.documentDate).toBeNull()
  })

  it('rejects an out-of-range day or month rather than producing an invalid date', () => {
    expect(parseTaxInvoiceBillJson(baseJson({ date_day: 32, date_month: 1 })).documentDate).toBeNull()
    expect(parseTaxInvoiceBillJson(baseJson({ date_day: 1, date_month: 13 })).documentDate).toBeNull()
  })

  it('rejects a day that does not exist in the selected calendar month', () => {
    expect(parseTaxInvoiceBillJson(baseJson({ date_day: 31, date_month: 2, date_year_ce: 2026 })).documentDate).toBeNull()
  })

  it('honors month lengths and Gregorian leap years', () => {
    expect(parseTaxInvoiceBillJson(baseJson({ date_day: 31, date_month: 4, date_year_ce: 2026 })).documentDate).toBeNull()
    expect(parseTaxInvoiceBillJson(baseJson({ date_day: 29, date_month: 2, date_year_ce: 2026 })).documentDate).toBeNull()
    expect(parseTaxInvoiceBillJson(baseJson({ date_day: 29, date_month: 2, date_year_ce: 2028 })).documentDate).toBe('2028-02-29')
  })

  it('still extracts subtotal, total, and payment method', () => {
    const result = parseTaxInvoiceBillJson(baseJson())
    expect(result).toMatchObject({ subtotalBaht: 1268, totalBaht: 1356, paymentMethod: 'credit_card' })
  })

  it('ignores an unrecognized payment method', () => {
    const result = parseTaxInvoiceBillJson(baseJson({ payment_method: 'bitcoin' }))
    expect(result.paymentMethod).toBeNull()
  })
})
