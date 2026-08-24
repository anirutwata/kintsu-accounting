import { afterAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { syncBankTransferToFlowAccount, voidBankTransferJournal } from './bankTransferSync'

const live = process.env.RUN_FLOWACCOUNT_JV_LIVE_TEST === '1' ? describe : describe.skip

live('FlowAccount bank transfer JV (production)', () => {
  let supabase: SupabaseClient | null = null
  let transferId: string | null = null
  let journalRecordId: number | null = null

  afterAll(async () => {
    if (!supabase) return
    if (journalRecordId) {
      const result = await voidBankTransferJournal(journalRecordId)
      if (!result.ok) throw new Error(`CLEANUP REQUIRED recordId=${journalRecordId}: ${result.error}`)
    }
    if (transferId) {
      const { error } = await supabase.from('bank_transfers').update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      }).eq('id', transferId)
      if (error) throw error
    }
  })

  it('creates one approved JV and reuses it on retry', async () => {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data: transfer, error } = await supabase.from('bank_transfers').insert({
      date: '2026-08-24',
      amount_satang: 100,
      from_bank: 'เงินสด',
      from_account: null,
      to_bank: 'กสิกรไทย',
      to_account: '160-8-75555-8',
      note: 'AUTO JV LIVE TEST — VOID AFTER VERIFY',
      created_by_name: 'Codex JV Test',
    }).select().single()
    expect(error).toBeNull()
    transferId = transfer!.id

    const first = await syncBankTransferToFlowAccount(supabase, transferId!)
    if (!first.ok) {
      journalRecordId = 'cleanupRequiredRecordId' in first ? first.cleanupRequiredRecordId ?? null : null
      throw new Error(first.error)
    }
    expect(first.ok).toBe(true)
    journalRecordId = first.recordId
    expect(first.created).toBe(true)
    expect(first.documentSerial).toMatch(/^JV/)

    const second = await syncBankTransferToFlowAccount(supabase, transferId!)
    expect(second).toEqual({ ...first, created: false })
  })
})
