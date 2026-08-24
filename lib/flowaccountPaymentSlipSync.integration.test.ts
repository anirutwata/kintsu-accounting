import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { previewFlowAccountPaymentSlipSync, syncFlowAccountPaymentSlips } from './flowaccountPaymentSlipSync'

const liveTest = process.env.RUN_FLOWACCOUNT_LIVE_TEST === '1' ? describe : describe.skip

liveTest('FlowAccount payment-slip live sync', () => {
  it('imports Jun-Aug PAY expenses and remains idempotent on a second sync', async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const preview = await previewFlowAccountPaymentSlipSync(supabase)
    expect(preview.sourceDocuments).toBeGreaterThan(0)

    const first = await syncFlowAccountPaymentSlips(supabase)
    expect(first.errors).toEqual([])

    const second = await syncFlowAccountPaymentSlips(supabase)
    expect(second.errors).toEqual([])
    expect(second.created).toBe(0)
    expect(second.updated).toBe(first.sourceDocuments)

    const { data, error } = await supabase
      .from('expenses')
      .select('flowaccount_record_id, flowaccount_payment_slip_serial')
      .eq('source', 'flowaccount_payment_slip')
      .eq('is_deleted', false)
    expect(error).toBeNull()
    expect(data).toHaveLength(first.sourceDocuments)
    expect(new Set(data!.map(row => row.flowaccount_record_id)).size).toBe(data!.length)
    expect(data!.every(row => row.flowaccount_payment_slip_serial?.startsWith('PAY'))).toBe(true)
  }, 120_000)
})
