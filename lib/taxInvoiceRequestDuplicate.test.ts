import { describe, expect, it } from 'vitest'
import { isDuplicateTaxInvoiceRequest } from './taxInvoiceRequestDuplicate'

const base = {
  documentDate: '2026-08-27',
  contactTaxId: '0105523002118',
  contactName: 'บริษัท ดีเคเอสเอช (ประเทศไทย) จำกัด สาขา 00016',
  totalSatang: 158_500,
}

describe('isDuplicateTaxInvoiceRequest', () => {
  it('blocks the same company, document date, and amount despite display-name differences', () => {
    expect(isDuplicateTaxInvoiceRequest(base, {
      ...base,
      contactName: 'บริษัท ดีเคเอสเอช (ประเทศไทย) จำกัด สาขาที่ 00016',
      contactTaxId: '010-5523-00211-8',
    })).toBe(true)
  })

  it('allows the same company and date when the amount differs', () => {
    expect(isDuplicateTaxInvoiceRequest(base, { ...base, totalSatang: 158_600 })).toBe(false)
  })

  it('uses a normalized company name when neither request has a tax ID', () => {
    expect(isDuplicateTaxInvoiceRequest(
      { ...base, contactTaxId: '', contactName: 'บริษัท ตัวอย่าง จำกัด' },
      { ...base, contactTaxId: null, contactName: '  บริษัท  ตัวอย่าง จำกัด  ' },
    )).toBe(true)
  })

  it('falls back to the normalized company name when historical data lacks a tax ID', () => {
    expect(isDuplicateTaxInvoiceRequest(
      base,
      { ...base, contactTaxId: null, contactName: base.contactName },
    )).toBe(true)
  })

  it('allows the same company and amount on a different document date', () => {
    expect(isDuplicateTaxInvoiceRequest(base, {
      ...base, documentDate: '2026-08-28',
    })).toBe(false)
  })
})
