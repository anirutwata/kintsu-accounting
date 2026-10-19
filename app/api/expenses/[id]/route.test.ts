/* eslint-disable @typescript-eslint/no-explicit-any -- minimal Supabase fake */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateFlowAccountSync = vi.fn()
const deleteFlowAccountSync = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: vi.fn() }))
vi.mock('@/lib/expenseSync', () => ({ updateFlowAccountSync, deleteFlowAccountSync }))
let fake: any
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake }))

const { PATCH, DELETE } = await import('./route')
const params = { params: Promise.resolve({ id: 'e1' }) }

// `reads` = successive results for plain selects; update returns `updateResult`.
function makeFake(reads: any[], updateResult: any) {
  const ors: string[] = []
  const filters: string[] = []
  return {
    ors, filters,
    from() {
      let op = 'select'
      const b: any = {
        select: () => b, eq: (k: string, v: any) => { filters.push(`${k}=${v}`); return b }, is: (k: string, v: any) => { filters.push(`${k} is ${v}`); return b }, or: (f: string) => { ors.push(f); return b },
        update: () => { op = 'update'; return b },
        maybeSingle: async () => ({ data: op === 'update' ? updateResult : reads.shift() ?? null }),
        single: async () => ({ data: op === 'update' ? updateResult : reads.shift() ?? null }),
      }
      return b
    },
  }
}

describe('DELETE /api/expenses/[id] during a FlowAccount create', () => {
  beforeEach(() => { deleteFlowAccountSync.mockReset() })

  it('soft-deletes only when no create is in flight (atomic filter) and returns 409 otherwise', async () => {
    fake = makeFake([{ source: null }], null)
    const res = await DELETE(new Request('http://x'), params)
    expect(res.status).toBe(409)
    expect(fake.ors).toEqual(['flowaccount_record_id.not.is.null,flowaccount_synced_at.is.null'])
    expect(deleteFlowAccountSync).not.toHaveBeenCalled()
  })

  it('deletes the linked FlowAccount document for a normal synced row', async () => {
    fake = makeFake([{ source: null }], { id: 'e1', category: 'x', amount_satang: 100, flowaccount_record_id: 7 })
    deleteFlowAccountSync.mockResolvedValue({ ok: true })
    const res = await DELETE(new Request('http://x'), params)
    expect(res.status).toBe(200)
    expect(deleteFlowAccountSync).toHaveBeenCalledWith(7)
  })
})

describe('PATCH /api/expenses/[id] during a FlowAccount create', () => {
  beforeEach(() => { updateFlowAccountSync.mockReset().mockResolvedValue({ ok: true }) })

  it('propagates when the create saved record_id after this edit was written', async () => {
    // update returned record_id null (create in flight), the re-read after the writes sees it
    fake = makeFake([{ source: null }, { flowaccount_record_id: 99, flowaccount_document_serial: 'EXP1' }], { id: 'e1', flowaccount_record_id: null })
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ note: 'n' }) }), params)
    expect(res.status).toBe(200)
    expect(updateFlowAccountSync).toHaveBeenCalledTimes(1)
  })

  it('refuses (409) atomically while a create is in flight, writing no items and no FlowAccount push', async () => {
    fake = makeFake([{ source: null }], null)
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ note: 'n', items: [] }) }), params)
    expect(res.status).toBe(409)
    expect(fake.ors).toEqual(['flowaccount_record_id.not.is.null,flowaccount_synced_at.is.null'])
    expect(updateFlowAccountSync).not.toHaveBeenCalled()
  })

  it('asserts the atomic update filters (id, not soft-deleted)', async () => {
    fake = makeFake([{ source: null }], null)
    await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ note: 'n' }) }), params)
    expect(fake.filters).toEqual(expect.arrayContaining(['id=e1', 'is_deleted=false']))
  })

  it('returns 404 (not the in-flight 409) for a soft-deleted row', async () => {
    fake = makeFake([{ source: null, is_deleted: true }], null)
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ note: 'n' }) }), params)
    expect(res.status).toBe(404)
    expect(fake.ors).toEqual([])
  })

  it('does not push when record_id is still null after the writes (unsynced row)', async () => {
    fake = makeFake([{ source: null }, { flowaccount_record_id: null }], { id: 'e1', flowaccount_record_id: null })
    await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ note: 'n' }) }), params)
    expect(updateFlowAccountSync).not.toHaveBeenCalled()
  })
})
