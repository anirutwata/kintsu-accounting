import { describe, expect, it, vi } from 'vitest'
import { withPaymentSlipReferences } from './flowaccountPaymentSlipSync'
import type { FlowAccountExpenseDocument } from './flowaccountExpenseImport'

const { getExpenseDocument } = vi.hoisted(() => ({ getExpenseDocument: vi.fn() }))
vi.mock('./flowaccount', () => ({ getExpenseDocument }))

function makeSupabase(rows: Array<{ flowaccount_record_id: number; flowaccount_payment_slip_serial: string | null }>) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  }
}

const pendingNoReference: FlowAccountExpenseDocument = {
  recordId: 60129999,
  documentSerial: 'EXP2026080158',
  status: '4',
  statusString: 'pendingPayment',
  publishedOn: '2026-08-31T00:00:00',
  grandTotal: '1694',
}

describe('withPaymentSlipReferences', () => {
  it('reuses a PAY serial already stored locally instead of calling FlowAccount again', async () => {
    getExpenseDocument.mockClear()
    const supabase = makeSupabase([{ flowaccount_record_id: pendingNoReference.recordId, flowaccount_payment_slip_serial: 'PAY2026090005' }])

    const [result] = await withPaymentSlipReferences(supabase as never, [pendingNoReference])

    expect(result.referencedToMe).toEqual([{ documentType: '37', documentSerial: 'PAY2026090005' }])
    expect(getExpenseDocument).not.toHaveBeenCalled()
  })

  it('fetches the single-document detail when no local PAY serial is known yet', async () => {
    getExpenseDocument.mockClear()
    getExpenseDocument.mockResolvedValue({
      referencedToMe: [{ documentType: 37, documentSerial: 'PAY2026090005' }],
    })
    const supabase = makeSupabase([])

    const [result] = await withPaymentSlipReferences(supabase as never, [pendingNoReference])

    expect(getExpenseDocument).toHaveBeenCalledWith(pendingNoReference.recordId)
    expect(result.referencedToMe).toEqual([{ documentType: 37, documentSerial: 'PAY2026090005' }])
  })

  it('leaves documents untouched when they are not payment-slip eligible or already carry referencedToMe', async () => {
    getExpenseDocument.mockClear()
    const awaiting: FlowAccountExpenseDocument = { ...pendingNoReference, recordId: 2, status: '1', statusString: 'awaiting' }
    const alreadyEnriched: FlowAccountExpenseDocument = {
      ...pendingNoReference,
      recordId: 3,
      referencedToMe: [{ documentType: '37', documentSerial: 'PAY2026080017' }],
    }
    const supabase = makeSupabase([])

    const result = await withPaymentSlipReferences(supabase as never, [awaiting, alreadyEnriched])

    expect(result).toEqual([awaiting, alreadyEnriched])
    expect(getExpenseDocument).not.toHaveBeenCalled()
  })
})
