import { describe, expect, it } from 'vitest'
import { groupExpensesByPaymentSlip, type PaymentSlipExpense } from './paymentSlipGrouping'

const base: PaymentSlipExpense = {
  id: '1',
  date: '2026-08-22',
  document_date: '2026-08-06',
  recipient_name: 'Vendor A',
  total_satang: 100_000,
  flowaccount_document_serial: 'EXP1',
  flowaccount_payment_slip_serial: 'PAY1',
  flowaccount_payment_channel: 'โอนเงิน - KasikornBank',
  flowaccount_reference: null,
}

describe('payment slip grouping', () => {
  it('shows one bank payment while retaining every source EXP document', () => {
    const groups = groupExpensesByPaymentSlip([
      base,
      { ...base, id: '2', flowaccount_document_serial: 'EXP2', total_satang: 250_000 },
      { ...base, id: '3', flowaccount_payment_slip_serial: 'PAY2', flowaccount_document_serial: 'EXP3', total_satang: 50_000 },
    ])

    expect(groups).toHaveLength(2)
    expect(groups.find(group => group.serial === 'PAY1')).toMatchObject({
      total_satang: 350_000,
      expenses: [{ flowaccount_document_serial: 'EXP1' }, { flowaccount_document_serial: 'EXP2' }],
    })
  })
})
