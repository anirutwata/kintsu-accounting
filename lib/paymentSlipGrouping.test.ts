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
  flowaccount_payment_status: 'paidByPaymentSlip',
  wht_satang: 0,
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

  it('orders payment slips by PAY document number descending', () => {
    const groups = groupExpensesByPaymentSlip([
      { ...base, flowaccount_payment_slip_serial: 'PAY2026080018' },
      { ...base, id: '2', flowaccount_payment_slip_serial: 'PAY2026080022' },
      { ...base, id: '3', flowaccount_payment_slip_serial: 'PAY2026080006' },
    ])
    expect(groups.map(group => group.serial)).toEqual([
      'PAY2026080022', 'PAY2026080018', 'PAY2026080006',
    ])
  })

  it('uses the net bank transfer after withholding tax', () => {
    const [group] = groupExpensesByPaymentSlip([{ ...base, total_satang: 107_000, wht_satang: 3_000 }])
    expect(group).toMatchObject({ gross_total_satang: 107_000, total_satang: 104_000, status: 'paid' })
  })

  it('shows a locally recorded transfer as awaiting FlowAccount', () => {
    const pending = { ...base, flowaccount_payment_status: 'pendingPayment' }
    const [group] = groupExpensesByPaymentSlip([pending], [{
      id: 'local-1',
      payment_slip_serial: 'PAY1',
      payment_date: '2026-08-24',
      bank_account_id: 'bank-1',
      bank_name: 'KBANK',
      account_number: '123-4-56789-0',
      amount_satang: 100_000,
      slip_image_url: 'https://example.com/slip.jpg',
      note: null,
      recorded_by_name: 'Anirut',
    }])

    expect(group).toMatchObject({
      status: 'awaiting_flowaccount',
      local_payment: { payment_slip_serial: 'PAY1', amount_satang: 100_000 },
    })
  })

  it('excludes a cancelled document from the group total but still lists it', () => {
    const cancelled = { ...base, id: '2', flowaccount_document_serial: 'EXP2', total_satang: 999_000, flowaccount_payment_status: 'cancelled' }
    const [group] = groupExpensesByPaymentSlip([base, cancelled])

    expect(group.total_satang).toBe(100_000)
    expect(group.gross_total_satang).toBe(100_000)
    expect(group.expenses.map(expense => expense.flowaccount_document_serial)).toEqual(['EXP1', 'EXP2'])
  })

  it('marks a PAY as cancelled when every one of its documents is cancelled', () => {
    const [group] = groupExpensesByPaymentSlip([{ ...base, flowaccount_payment_status: 'cancelled' }])
    expect(group).toMatchObject({ status: 'cancelled', total_satang: 0, gross_total_satang: 0 })
  })

  it('uses FlowAccount paid status as final even when a local transfer exists', () => {
    const [group] = groupExpensesByPaymentSlip([base], [{
      id: 'local-1',
      payment_slip_serial: 'PAY1',
      payment_date: '2026-08-24',
      bank_account_id: 'bank-1',
      bank_name: 'KBANK',
      account_number: '123-4-56789-0',
      amount_satang: 100_000,
      slip_image_url: 'https://example.com/slip.jpg',
      note: null,
      recorded_by_name: 'Anirut',
    }])

    expect(group.status).toBe('paid')
    expect(group.local_payment?.slip_image_url).toBe('https://example.com/slip.jpg')
  })
})
