import { describe, expect, it } from 'vitest'
import {
  mapFlowAccountExpense,
  selectImportCandidates,
  type FlowAccountExpenseDocument,
} from './flowaccountExpenseImport'

const paidBySlip: FlowAccountExpenseDocument = {
  recordId: 59478750,
  documentSerial: 'EXP2026080070',
  status: '6',
  statusString: 'paidByPaymentSlip',
  publishedOn: '2026-08-06T00:00:00',
  contactName: 'บริษัท ซีทีไอ ฟู้ด ซัพพลาย จํากัด',
  contactAddress: '5 ถนนเกษมราษฎร์',
  reference: 'LN26-07879',
  subTotal: '16757',
  discountAmount: '0',
  vatAmount: '0',
  grandTotal: '16757',
  isVatInclusive: false,
  documentWithholdingTaxAmount: '0',
  referencedToMe: [{ documentType: '37', documentSerial: 'PAY2026080017' }],
  payments: {
    paymentDate: '2026-08-22T00:00:00',
    paymentMethod: '5',
    paymentChannel: 'โอนเงิน - KasikornBank',
  },
  items: [{
    description: 'Teys Black GrainFed 150D Oyster Blade IKGS',
    debitId: 444011608,
    debitCode: '51121.01',
    debitNameLocal: '51121.01 / ซื้อวัตถุดิบประกอบอาหาร',
    quantity: '25.78',
    unitName: 'KG',
    pricePerUnit: '650',
    total: '16757',
  }],
}

describe('FlowAccount payment-slip expense import', () => {
  it('maps an EXP paid by PAY into one KINTSU expense without duplicating the PAY total', () => {
    const mapped = mapFlowAccountExpense(paidBySlip, new Map([[444011608, 'วัตถุดิบทางตรง-อื่นๆ']]))

    expect(mapped.expense).toMatchObject({
      document_date: '2026-08-06',
      date: '2026-08-22',
      amount_satang: 1_675_700,
      total_satang: 1_675_700,
      payment_method: 'โอนเงิน',
      recipient_name: 'บริษัท ซีทีไอ ฟู้ด ซัพพลาย จํากัด',
      flowaccount_record_id: 59478750,
      flowaccount_document_serial: 'EXP2026080070',
      flowaccount_payment_slip_serial: 'PAY2026080017',
      source: 'flowaccount_payment_slip',
    })
    expect(mapped.items).toEqual([expect.objectContaining({
      category: 'วัตถุดิบทางตรง-อื่นๆ',
      description: 'Teys Black GrainFed 150D Oyster Blade IKGS',
      total_satang: 1_675_700,
    })])
  })

  it('imports only active paid-by-payment-slip documents and skips existing record IDs', () => {
    const awaiting = { ...paidBySlip, recordId: 2, status: '1', statusString: 'awaiting' }
    const deleted = { ...paidBySlip, recordId: 3, isDelete: true }
    const another = { ...paidBySlip, recordId: 4, documentSerial: 'EXP2026080071' }

    const result = selectImportCandidates(
      [paidBySlip, awaiting, deleted, another],
      new Set([paidBySlip.recordId]),
    )

    expect(result.map(document => document.recordId)).toEqual([4])
  })

  it('maps audited historical FlowAccount debit accounts instead of using a generic fallback', () => {
    const mapped = mapFlowAccountExpense(paidBySlip, new Map())
    expect(mapped.items[0].category).toBe('วัตถุดิบทางตรง-อื่นๆ')
  })
})
