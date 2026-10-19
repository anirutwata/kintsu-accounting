import { describe, expect, it, vi } from 'vitest'
import { pickLocalMatch, withPaymentSlipReferences } from './flowaccountPaymentSlipSync'
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

  it('also looks up a cancelled document, in case it was voided after being grouped into a PAY', async () => {
    getExpenseDocument.mockClear()
    getExpenseDocument.mockResolvedValue({ referencedToMe: [{ documentType: 37, documentSerial: 'PAY2026080017' }] })
    const cancelled: FlowAccountExpenseDocument = { ...pendingNoReference, recordId: 4, status: 'void', statusString: undefined }
    const supabase = makeSupabase([])

    const [result] = await withPaymentSlipReferences(supabase as never, [cancelled])

    expect(getExpenseDocument).toHaveBeenCalledWith(cancelled.recordId)
    expect(result.referencedToMe).toEqual([{ documentType: 37, documentSerial: 'PAY2026080017' }])
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

describe('pickLocalMatch (PAY line vs local rows with same date + total)', () => {
  const row = (id: string, o: Partial<{ recipient_name: string; flowaccount_record_id: number; flowaccount_synced_at: string }> = {}) =>
    ({ id, recipient_name: 'ร้าน A', flowaccount_record_id: null, flowaccount_synced_at: null, ...o })

  it('skips while any same date/total row has a create claim (in flight or locked), whatever its vendor', () => {
    expect(pickLocalMatch([row('a'), row('b', { recipient_name: 'อื่น', flowaccount_synced_at: '2026-10-19T00:00:00Z' })], 'ร้าน A')).toEqual({ skip: true })
  })

  it('never links a row that already has its own record id; links only an unclaimed exact-vendor row', () => {
    expect(pickLocalMatch([row('a', { flowaccount_record_id: 5, flowaccount_synced_at: 'x' })], 'ร้าน A')).toEqual({ skip: false, linkId: null })
    expect(pickLocalMatch([row('a'), row('b', { recipient_name: 'อื่น' })], 'บริษัท ร้าน A จำกัด')).toEqual({ skip: false, linkId: 'a' })
    expect(() => pickLocalMatch([row('a'), row('b')], 'ร้าน A')).toThrow()
  })
})
