/* eslint-disable @typescript-eslint/no-explicit-any -- minimal Supabase fake */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createExpense = vi.fn()
const listFlowAccountExpenses = vi.fn()
const FA = await vi.hoisted(async () => {
  class FlowAccountError extends Error {
    constructor(m: string, readonly status?: number, readonly notSent = false, readonly fromApiJson = false) { super(m) }
  }
  const isDefiniteRejection = (e: unknown) => e instanceof FlowAccountError && (e.notSent || (e.status !== undefined && e.status >= 400 && e.status < 500 && e.status !== 408))
  return { FlowAccountError, isDefiniteRejection }
})
vi.mock('@/lib/flowaccount', () => ({
  createExpense, FlowAccountError: FA.FlowAccountError, isDefiniteRejection: FA.isDefiniteRejection, getExpenseDocument: vi.fn(), updateExpense: vi.fn(), deleteExpenseDocument: vi.fn(), attachExpenseFiles: vi.fn(), listFlowAccountExpenses, payExpense: vi.fn(),
  findContact: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/vendorOcr', () => ({ extractVendorInfoFromReceipt: vi.fn() }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: vi.fn() }))

const { syncExpenseToFlowAccount } = await import('./expenseSync')

// Minimal chainable fake: every builder method returns itself; terminal calls resolve
// per table/operation.
function fakeSupabase(expense: any, claimSucceeds = true) {
  return {
    from(table: string) {
      let op = 'select'
      const b: any = {
        select: () => b, eq: () => b, is: () => b, order: () => b,
        update: () => { op = 'update'; return b },
        single: async () => (op === 'update' ? { data: { ...expense, flowaccount_record_id: 1 } } : { data: expense }),
        maybeSingle: async () => {
          if (table === 'expense_categories') return { data: { flowaccount_debit_id: 1, flowaccount_system_code: 1, flowaccount_category_id: 1 } }
          return { data: claimSucceeds ? { ...expense } : null }
        },
        then: (r: any) => r({ data: table === 'expense_items' ? [] : null }),
      }
      return b
    },
  }
}

const base = { id: 'e1', category: 'Staff meal', total_satang: 38500, recipient_name: 'ร้านข้าวลุงแว่น', date: '2026-10-12', receipt_image_urls: [] }

describe('syncExpenseToFlowAccount idempotency', () => {
  beforeEach(() => { createExpense.mockReset().mockResolvedValue({ recordId: 99, documentSerial: 'EXP2026100999' }) })

  it('refuses an expense that already has a FlowAccount link — never creates a second document', async () => {
    const r = await syncExpenseToFlowAccount(fakeSupabase({ ...base, flowaccount_record_id: 80, flowaccount_document_serial: 'EXP2026100080' }), 'e1')
    expect(r.ok).toBe(false)
    expect(r).toHaveProperty('alreadySynced', true)
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('refuses when another call already claimed the row (double-tap)', async () => {
    const r = await syncExpenseToFlowAccount(fakeSupabase({ ...base }, false), 'e1')
    expect(r.ok).toBe(false)
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('empty 2xx body (createExpense -> null): ambiguous, keeps the lock, never throws', async () => {
    createExpense.mockReset().mockResolvedValue(null)
    const sb = fakeSupabase({ ...base }); const updates: any[] = []
    const orig = sb.from; sb.from = (t: string) => { const b = orig(t); const u = b.update; b.update = (x: any) => { updates.push(x); return u(x) }; return b }
    const r = await syncExpenseToFlowAccount(sb, 'e1') as any
    expect(r.ok).toBe(false); expect(r.alreadySynced).toBe(true)
    expect(r.error).toContain('FlowAccount')
    expect(updates.some(u => u.flowaccount_synced_at === null)).toBe(false)
  })

  it('creates once for a never-synced expense', async () => {
    const r = await syncExpenseToFlowAccount(fakeSupabase({ ...base }), 'e1')
    expect(r.ok).toBe(true)
    expect(createExpense).toHaveBeenCalledTimes(1)
  })
})

describe('syncExpenseToFlowAccount failure handling', () => {
  const spyUpdates = (sb: any) => { const updates: any[] = []; const orig = sb.from; sb.from = (t: string) => { const b = orig(t); const u = b.update; b.update = (x: any) => { updates.push(x); return u(x) }; return b }; return updates }

  it('keeps the lock on an ambiguous failure (5xx / network) and tells the user to check FlowAccount', async () => {
    for (const err of [new FA.FlowAccountError('boom (502)', 502), new FA.FlowAccountError('timeout'), new TypeError('fetch failed')]) {
      createExpense.mockReset().mockRejectedValue(err)
      const sb = fakeSupabase({ ...base }); const updates = spyUpdates(sb)
      const r = await syncExpenseToFlowAccount(sb, 'e1') as any
      expect(r.ok).toBe(false)
      expect(r.error).toContain('ล็อก')
      expect(updates.some(u => u.flowaccount_synced_at === null)).toBe(false)
    }
  })

  it('releases the lock when the token step fails (notSent)', async () => {
    createExpense.mockReset().mockRejectedValue(new FA.FlowAccountError('token failed', undefined, true))
    const sb = fakeSupabase({ ...base }); const updates = spyUpdates(sb)
    const r = await syncExpenseToFlowAccount(sb, 'e1')
    expect(r.ok).toBe(false)
    expect(updates.some(u => u.flowaccount_synced_at === null)).toBe(true)
  })

  it('releases the lock on a definite 4xx rejection', async () => {
    createExpense.mockReset().mockRejectedValue(new FA.FlowAccountError('bad (400)', 400))
    const sb = fakeSupabase({ ...base }); const updates = spyUpdates(sb)
    const r = await syncExpenseToFlowAccount(sb, 'e1')
    expect(r.ok).toBe(false)
    expect(updates.some(u => u.flowaccount_synced_at === null)).toBe(true)
  })
})

describe('refreshFlowAccountStatus', () => {
  const run = async (fa: () => Promise<unknown>, status: string | null = null) => {
    const { getExpenseDocument } = await import('@/lib/flowaccount') as any
    getExpenseDocument.mockReset().mockImplementation(fa)
    const updates: any[] = []
    const sb: any = { from: () => { const b: any = {
      select: () => b, eq: () => b, is: () => b,
      maybeSingle: async () => ({ data: { flowaccount_record_id: 5, flowaccount_payment_status: status } }),
      update: (u: any) => { updates.push(u); return b }, then: (r: any) => r({ error: null }) }; return b } }
    const { refreshFlowAccountStatus } = await import('./expenseSync')
    return { res: await refreshFlowAccountStatus(sb, 'e1'), updates }
  }
  beforeEach(() => { listFlowAccountExpenses.mockReset().mockResolvedValue({ totalDocument: 0, list: [] }) })

  it('does not cancel on a JSON 404 when the health-check read fails (wrong endpoint/credentials)', async () => {
    listFlowAccountExpenses.mockRejectedValue(new FA.FlowAccountError('FlowAccount API error (404): "x"', 404, false, true))
    const r = await run(async () => { throw new FA.FlowAccountError('FlowAccount API error (404): "x"', 404, false, true) })
    expect(r.res.ok).toBe(false); expect(r.updates).toHaveLength(0)
    expect(listFlowAccountExpenses).toHaveBeenCalledTimes(1)
  })

  it('marks cancelled on 404 / isDelete / void, but not on other errors', async () => {
    expect((await run(async () => { throw new FA.FlowAccountError('FlowAccount API error (404): "x"', 404, false, true) })).updates[0].flowaccount_payment_status).toBe('cancelled')
    expect((await run(async () => ({ isDelete: true }))).res).toMatchObject({ cancelled: true })
    expect((await run(async () => ({ statusString: 'void' }))).res).toMatchObject({ cancelled: true })
    // 404 from the token request (notSent) must not cancel
    const tok = await run(async () => { throw new FA.FlowAccountError('token failed', 404, true) })
    expect(tok.res.ok).toBe(false); expect(tok.updates).toHaveLength(0)
    // non-JSON (HTML) 404 must not cancel
    const html = await run(async () => { throw new FA.FlowAccountError('FlowAccount API error (404): unparseable response', 404) })
    expect(html.res.ok).toBe(false); expect(html.updates).toHaveLength(0)
    const net = await run(async () => { throw new FA.FlowAccountError('FlowAccount API error (500): "x"', 500) })
    expect(net.res.ok).toBe(false); expect(net.updates).toHaveLength(0)
    expect((await run(async () => ({ status: 4 }))).updates).toHaveLength(0)
    expect((await run(async () => ({ status: 4 }))).res).toMatchObject({ paid: false, inPaymentSlip: true })
    // ambiguous: empty/invalid payload, or "(404)" only in message text, must not cancel
    for (const fa of [async () => null, async () => ({}), async () => { throw new Error('proxy said (404) page') }]) {
      const r = await run(fa as any)
      expect(r.res.ok).toBe(false); expect(r.updates).toHaveLength(0)
    }
  })
  it('mirrors a document paid in FlowAccount (5/11/23/6, incl. word forms) as paid; 4/awaiting/void are not', async () => {
    for (const doc of [{ status: 5 }, { status: 11, statusString: 'received' }, { status: 23 }, { statusString: 'receivedByPaymentSlip' }, { status: 6 }]) {
      const r = await run(async () => doc)
      expect(r.res).toMatchObject({ paid: true })
      expect(r.updates[0].flowaccount_paid_at).toBeTruthy()
    }
    for (const doc of [{ status: 4 }, { statusString: 'awaiting' }, { status: 5, statusString: 'void' }]) {
      expect((await run(async () => doc)).res).toMatchObject({ paid: false })
    }
    const r = await run(async () => ({ status: 11, payments: { paymentDate: '2026-10-26T00:00:00' } }))
    expect(r.updates[0].flowaccount_paid_at).toBe(new Date('2026-10-26T00:00:00').toISOString())
  })
})

describe('syncExpenseToFlowAccount vs concurrent delete / edit', () => {
  // Stateful fake: select reads `row`, update merges into it (after its filters pass).
  function statefulSupabase(row: any) {
    const calls: Array<{ op: string; filters: string[]; values?: any }> = []
    const sb = {
      from(table: string) {
        let op = 'select'; let values: any; const filters: string[] = []
        const b: any = {
          select: () => b, order: () => b,
          eq: (k: string, v: any) => { filters.push(`${k}=${v}`); return b },
          is: (k: string, v: any) => { filters.push(`${k} is ${v}`); return b },
          update: (v: any) => { op = 'update'; values = v; return b },
          single: async () => { if (op === 'update') Object.assign(row, values); calls.push({ op, filters, values }); return { data: { ...row } } },
          maybeSingle: async () => {
            if (table === 'expense_categories') return { data: { flowaccount_debit_id: 1, flowaccount_system_code: 1, flowaccount_category_id: 1 } }
            calls.push({ op, filters, values })
            if (op === 'update') { Object.assign(row, values); return { data: { ...row } } }
            return { data: { ...row } }
          },
          then: (r: any) => r({ data: table === 'expense_items' ? [] : null }),
        }
        return b
      },
    }
    return { sb, calls }
  }

  it('claims only a non-deleted row (so DELETE and the claim are mutually exclusive)', async () => {
    createExpense.mockReset().mockResolvedValue({ recordId: 99, documentSerial: 'EXP1' })
    const { sb, calls } = statefulSupabase({ ...base, is_deleted: false })
    await syncExpenseToFlowAccount(sb, 'e1')
    const claim = calls.find(c => c.op === 'update' && c.filters.includes('flowaccount_synced_at is null'))!
    expect(claim.filters).toContain('is_deleted=false')
    expect(claim.filters).toContain('flowaccount_record_id is null')
  })

  it('builds the document from the row returned by the claim (edits before the claim are sent)', async () => {
    const row: any = { ...base, is_deleted: false }
    const { sb } = statefulSupabase(row)
    const origFrom = sb.from
    let first = true
    // the pre-claim read sees the old amount; the edit lands just before the claim
    sb.from = (t: string) => { const b = origFrom(t); const s = b.single; b.single = async () => { if (first && t === 'expenses') { first = false; const r = await s(); row.total_satang = 50000; return r } return s() }; return b }
    createExpense.mockReset().mockResolvedValue({ recordId: 99, documentSerial: 'EXP1' })
    expect((await syncExpenseToFlowAccount(sb, 'e1')).ok).toBe(true)
    expect(createExpense.mock.calls[0][0].items[0].pricePerUnit).toBe(500)
  })

  it('alerts (never pushes an update) when an edit landed while the create was in flight', async () => {
    const { updateExpense } = await import('@/lib/flowaccount') as any
    const { sendTelegram } = await import('@/lib/telegram') as any
    updateExpense.mockReset(); sendTelegram.mockReset()
    const row: any = { ...base, is_deleted: false }
    createExpense.mockReset().mockImplementation(async () => { row.total_satang = 50000; return { recordId: 99, documentSerial: 'EXP1' } })
    const { sb } = statefulSupabase(row)
    const r = await syncExpenseToFlowAccount(sb, 'e1')
    expect(r.ok).toBe(true)
    expect(updateExpense).not.toHaveBeenCalled()
    expect(sendTelegram).toHaveBeenCalledTimes(1)
    expect(sendTelegram.mock.calls[0][0]).toContain('แก้ไขระหว่างส่ง')
  })

  it('does not re-send when nothing changed during the create', async () => {
    const { updateExpense } = await import('@/lib/flowaccount') as any
    updateExpense.mockReset()
    createExpense.mockReset().mockResolvedValue({ recordId: 99, documentSerial: 'EXP1' })
    const { sendTelegram } = await import('@/lib/telegram') as any
    sendTelegram.mockReset()
    const { sb } = statefulSupabase({ ...base, is_deleted: false })
    expect((await syncExpenseToFlowAccount(sb, 'e1')).ok).toBe(true)
    expect(updateExpense).not.toHaveBeenCalled()
    expect(sendTelegram).not.toHaveBeenCalled()
  })
})

describe('payFlowAccountSync guards', () => {
  const run = async (fa: () => Promise<unknown>) => {
    const { getExpenseDocument, payExpense } = await import('@/lib/flowaccount') as any
    getExpenseDocument.mockReset().mockImplementation(fa)
    payExpense.mockReset().mockResolvedValue({})
    const row = { id: 'e1', flowaccount_record_id: 5, flowaccount_payment_status: null, flowaccount_paid_at: null, payment_method: 'เงินสด', total_satang: 100, date: '2026-10-27' }
    const sb: any = { from: () => { const b: any = {
      select: () => b, eq: () => b, is: () => b, update: () => b,
      single: async () => ({ data: row }), maybeSingle: async () => ({ data: row }),
      then: (r: any) => r({ error: null }) }; return b } }
    const { payFlowAccountSync } = await import('./expenseSync')
    return { res: await payFlowAccountSync(sb, 'e1') as any, payExpense }
  }

  it('already paid in FlowAccount → recorded, no second payment posted', async () => {
    const r = await run(async () => ({ status: 11 }))
    expect(r.res.ok).toBe(true); expect(r.payExpense).not.toHaveBeenCalled()
  })
  it('cancelled or inside an unpaid PAY → refused, no payment posted', async () => {
    for (const doc of [{ isDelete: true }, { status: 4 }]) {
      const r = await run(async () => doc)
      expect(r.res.ok).toBe(false); expect(r.payExpense).not.toHaveBeenCalled()
    }
  })
  it('status check failing → refused, no payment posted (could hide an existing payment)', async () => {
    const r = await run(async () => { throw new FA.FlowAccountError('FlowAccount API error (500): "x"', 500) })
    expect(r.res.ok).toBe(false); expect(r.payExpense).not.toHaveBeenCalled()
  })
  it('deleted document that still carries a paid status is cancelled, not paid', async () => {
    const r = await run(async () => ({ isDelete: true, status: 5 }))
    expect(r.res.ok).toBe(false); expect(r.payExpense).not.toHaveBeenCalled()
  })
  it('verified awaiting document → payment posted once', async () => {
    const r = await run(async () => ({ status: 1, statusString: 'awaiting' }))
    expect(r.res.ok).toBe(true); expect(r.payExpense).toHaveBeenCalledTimes(1)
  })
})
