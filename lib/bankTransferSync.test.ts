/* eslint-disable @typescript-eslint/no-explicit-any -- minimal Supabase fake */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createApprovedJournal } = vi.hoisted(() => ({ createApprovedJournal: vi.fn() }))
vi.mock('./flowaccount', async (orig) => ({ ...(await orig() as any), createApprovedJournal, getChartOfAccounts: vi.fn(), voidJournalEntry: vi.fn() }))
const { syncBankTransferToFlowAccount } = await import('./bankTransferSync')
const { FlowAccountError } = await import('./flowaccount')

const transfer = {
  id: 't1', date: '2026-10-12', amount_satang: 10000, from_bank: 'KBank', from_account: '111', to_bank: 'SCB', to_account: '222', note: null,
  flowaccount_journal_record_id: null, flowaccount_journal_serial: null, flowaccount_journal_state: 'idle', flowaccount_cleanup_record_id: null,
}

function fakeSupabase(row: any) {
  const updates: any[] = []
  return {
    updates,
    from(table: string) {
      let op = 'select'
      const b: any = {
        select: () => b, eq: () => b, is: () => b, in: () => b,
        update: (v: any) => { op = 'update'; updates.push(v); return b },
        maybeSingle: async () => ({ data: op === 'update' ? { id: row.id } : row }),
        then: (r: any) => r(table === 'bank_accounts'
          ? { data: [{ bank_name: 'KBank', account_number: '111', flowaccount_chart_of_account_id: 1 }, { bank_name: 'SCB', account_number: '222', flowaccount_chart_of_account_id: 2 }], error: null }
          : { data: null, error: null }),
      }
      return b
    },
  }
}

const lastState = (sb: any) => sb.updates[sb.updates.length - 1].flowaccount_journal_state

describe('syncBankTransferToFlowAccount ambiguous create failure', () => {
  beforeEach(() => { createApprovedJournal.mockReset() })

  it('keeps the row locked in "creating" on network / timeout / 5xx / unparseable', async () => {
    for (const err of [new TypeError('fetch failed'), new FlowAccountError('timeout'), new FlowAccountError('(502)', 502), new FlowAccountError('(408)', 408), new FlowAccountError('unparseable')]) {
      createApprovedJournal.mockReset().mockRejectedValue(err)
      const sb = fakeSupabase({ ...transfer })
      const r = await syncBankTransferToFlowAccount(sb as any, 't1')
      expect(r.ok).toBe(false)
      expect(lastState(sb)).toBe('creating')
      expect((r as any).error).toContain('ล็อก')
    }
  })

  it('releases to retryable "error" on a definite rejection or before the create call', async () => {
    for (const err of [new FlowAccountError('(400)', 400, false, true), new FlowAccountError('token', undefined, true)]) {
      createApprovedJournal.mockReset().mockRejectedValue(err)
      const sb = fakeSupabase({ ...transfer })
      await syncBankTransferToFlowAccount(sb as any, 't1')
      expect(lastState(sb)).toBe('error')
    }
    // unmapped account → fails before createApprovedJournal is called
    createApprovedJournal.mockReset()
    const sb = fakeSupabase({ ...transfer, to_account: '999' })
    await syncBankTransferToFlowAccount(sb as any, 't1')
    expect(createApprovedJournal).not.toHaveBeenCalled()
    expect(lastState(sb)).toBe('error')
  })

  it('refuses a row with a record id but no serial instead of creating a second JV', async () => {
    const sb = fakeSupabase({ ...transfer, flowaccount_journal_record_id: 5, flowaccount_journal_state: 'synced' })
    const r = await syncBankTransferToFlowAccount(sb as any, 't1')
    expect(r.ok).toBe(false)
    expect(createApprovedJournal).not.toHaveBeenCalled()
  })
})
