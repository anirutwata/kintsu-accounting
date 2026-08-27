import { describe, expect, it } from 'vitest'
import { buildTaxInvoiceRevenueReversal } from './taxInvoiceRevenueAdjustment'

const accounts = {
  revenue: { chartOfAccountId: 10, code: '41210', label: 'รายได้จากการให้บริการ' },
  cash: { chartOfAccountId: 11, code: '11112', label: 'เงินสดคงเหลือ' },
  transfer: { chartOfAccountId: 12, code: '11122.07', label: 'TTB 7602315983' },
}

describe('buildTaxInvoiceRevenueReversal', () => {
  it('removes the gross receipt from the daily cash JV before the paid tax invoice replaces it', () => {
    expect(buildTaxInvoiceRevenueReversal({
      requestId: '12345678-aaaa-bbbb-cccc-123456789012', documentDate: '2026-08-24',
      paymentMethod: 'cash', totalSatang: 146_900, invoiceSerial: 'INV2026080029',
      accounts,
    })).toMatchObject({
      documentDate: '2026-08-24', reference: 'KINTSU-TIR-12345678',
      bookOfAccounts: [
        { debitCredit: 1, chartOfAccountId: 10, value: 1469 },
        { debitCredit: 3, chartOfAccountId: 11, value: 1469 },
      ],
    })
  })

  it('credits the exact TTB account for a transfer receipt', () => {
    expect(buildTaxInvoiceRevenueReversal({
      requestId: '87654321-aaaa-bbbb-cccc-123456789012', documentDate: '2026-08-23',
      paymentMethod: 'transfer', totalSatang: 163_400, invoiceSerial: 'INV2026080028',
      accounts,
    }).bookOfAccounts[1]).toMatchObject({
      debitCredit: 3, chartOfAccountId: 12, value: 1634,
    })
  })

  it('refuses to build a reversal for EDC because its tax document must be replaced instead', () => {
    expect(() => buildTaxInvoiceRevenueReversal({
      requestId: '12345678-aaaa-bbbb-cccc-123456789012', documentDate: '2026-08-24',
      paymentMethod: 'credit_card', totalSatang: 10_700, invoiceSerial: 'INV1',
      accounts,
    })).toThrow('EDC ต้องปรับเอกสาร Cash Sale ไม่ใช่สร้าง reversal JV')
  })
})
