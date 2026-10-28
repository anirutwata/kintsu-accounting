import { describe, expect, it, vi } from 'vitest'
import { pickLocalMatch, withPaymentSlipReferences, isUnchangedSettledRow, MAX_DETAIL_LOOKUPS_PER_RUN } from './flowaccountPaymentSlipSync'
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

describe('withPaymentSlipReferences backlog handling', () => {
  const doc = (n: number): FlowAccountExpenseDocument => ({ ...pendingNoReference, recordId: 70000000 + n, documentSerial: `EXP${n}` })

  it('caps detail fetches per run and leaves the rest un-enriched (never throws)', async () => {
    getExpenseDocument.mockReset().mockResolvedValue({ referencedToMe: [{ documentType: '37', documentSerial: 'PAY1' }] })
    const docs = Array.from({ length: MAX_DETAIL_LOOKUPS_PER_RUN + 5 }, (_, i) => doc(i))
    const result = await withPaymentSlipReferences(makeSupabase([]) as never, docs)
    expect(getExpenseDocument).toHaveBeenCalledTimes(MAX_DETAIL_LOOKUPS_PER_RUN)
    expect(result.filter(d => d.referencedToMe?.length)).toHaveLength(MAX_DETAIL_LOOKUPS_PER_RUN)
  })

  it('one failing detail fetch is skipped, the rest still resolve', async () => {
    getExpenseDocument.mockReset()
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValue({ referencedToMe: [{ documentType: '37', documentSerial: 'PAY2' }] })
    const result = await withPaymentSlipReferences(makeSupabase([]) as never, [doc(1), doc(2)])
    expect(result[0].referencedToMe).toBeUndefined()
    expect(result[1].referencedToMe).toHaveLength(1)
  })
})

describe('isUnchangedSettledRow', () => {
  const paid: FlowAccountExpenseDocument = { ...pendingNoReference, status: 23, statusString: 'receivedByPaymentSlip', referencedToMe: [{ documentType: '37', documentSerial: 'PAY2026100001' }] }
  const row = { source: 'flowaccount_payment_slip', is_deleted: false, flowaccount_payment_status: 'paidByPaymentSlip', flowaccount_payment_slip_serial: 'PAY2026100001' }

  it('skips a settled, unchanged PAY row', () => {
    expect(isUnchangedSettledRow(row, paid)).toBe(true)
  })
  it('does not skip when new, soft-deleted (restore), own-source, status/serial changed, or still pending', () => {
    expect(isUnchangedSettledRow(undefined, paid)).toBe(false)
    expect(isUnchangedSettledRow({ ...row, is_deleted: true }, paid)).toBe(false)
    expect(isUnchangedSettledRow({ ...row, source: 'kintsu' }, paid)).toBe(false)
    expect(isUnchangedSettledRow({ ...row, flowaccount_payment_status: 'receivedByPaymentSlip' }, paid)).toBe(false)
    expect(isUnchangedSettledRow({ ...row, flowaccount_payment_slip_serial: 'PAY2026100002' }, paid)).toBe(false)
    expect(isUnchangedSettledRow(row, { ...paid, status: 4, statusString: 'pendingPayment' })).toBe(false)
  })
})
