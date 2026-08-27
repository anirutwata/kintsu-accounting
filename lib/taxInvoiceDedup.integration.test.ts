import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  getJournalEntry, getTaxInvoice, voidJournalEntry, voidTaxInvoice,
} from './flowaccount'
import { isFlowAccountDocumentVoided } from './flowaccountVoid'
import { processApprovedTaxInvoice } from './taxInvoiceApprovalService'
import { getTodayBKK } from './utils'

const liveTest = process.env.RUN_TAX_INVOICE_DEDUP_LIVE_TEST === '1' ? describe : describe.skip

function document(response: unknown) {
  const value = response as { list?: unknown[] }
  return value?.list?.[0] ?? response
}

liveTest('customer tax-invoice revenue dedup (production)', () => {
  it('creates one paid invoice plus one reversal, reuses both, then voids and soft-deletes the test', async () => {
    if ((process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0) <= 50) {
      throw new Error('RUN_TAX_INVOICE_DEDUP_LIVE_TEST ต้องใช้ SUPABASE_SERVICE_ROLE_KEY จริง')
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    let requestId: string | null = null
    let invoiceRecordId: number | null = null
    let reversalRecordId: number | null = null
    try {
      const { data: sales, error: salesError } = await supabase.from('daily_sales')
        .select('id,cash_satang,papaya_cash_satang,flowaccount_cash_journal_state,flowaccount_cash_record_id,flowaccount_cash_document_serial')
        .eq('flowaccount_cash_journal_state', 'synced').not('flowaccount_cash_record_id', 'is', null)
        .not('flowaccount_cash_document_serial', 'is', null).order('id', { ascending: false }).limit(40)
      if (salesError) throw salesError
      const source = sales?.find(row => Number(row.cash_satang || 0) + Number(row.papaya_cash_satang || 0) >= 107)
      if (!source) throw new Error('ไม่พบวันรายได้ cash สำหรับ live test')

      const { data: inserted, error: insertError } = await supabase.from('tax_invoice_requests').insert({
        document_date: source.id,
        contact_group: 'juristic',
        contact_name: 'Codex Tax Invoice Dedup Test',
        contact_tax_id: null,
        contact_address: null,
        contact_branch: 'สำนักงานใหญ่',
        contact_email: 'codex-test@example.com',
        description: 'ทดสอบระบบป้องกันรายได้ซ้ำ',
        subtotal_satang: 100,
        total_satang: 107,
        payment_method: 'cash',
        bill_image_url: 'https://example.com/codex-test-receipt.jpg',
        status: 'processing',
      }).select('id').single()
      if (insertError || !inserted) throw insertError || new Error('สร้างคำขอทดสอบไม่สำเร็จ')
      const liveRequestId = String(inserted.id)
      requestId = liveRequestId

      const first = await processApprovedTaxInvoice(supabase, liveRequestId, getTodayBKK())
      if (!first.ok) throw new Error('live test ถูกส่ง manual review')
      invoiceRecordId = first.invoice.recordId
      reversalRecordId = first.correction?.recordId ?? null
      expect(reversalRecordId).toBeTruthy()

      const retry = await processApprovedTaxInvoice(supabase, liveRequestId, getTodayBKK())
      expect(retry).toMatchObject({
        ok: true,
        invoice: { recordId: invoiceRecordId },
        correction: { recordId: reversalRecordId },
        created: false,
      })
      expect(isFlowAccountDocumentVoided(document(await getTaxInvoice(invoiceRecordId)))).toBe(false)
    } finally {
      const cleanupErrors: unknown[] = []
      if (reversalRecordId) {
        try {
          await voidJournalEntry(reversalRecordId).catch(error => {
            if (!(error instanceof Error) || !error.message.includes('invalid status')) throw error
          })
          try {
            expect(isFlowAccountDocumentVoided(document(await getJournalEntry(reversalRecordId)))).toBe(true)
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('(404)')) throw error
          }
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      if (invoiceRecordId) {
        try {
          await voidTaxInvoice(invoiceRecordId).catch(error => {
            if (!(error instanceof Error) || !error.message.includes('invalid status')) throw error
          })
          expect(isFlowAccountDocumentVoided(document(await getTaxInvoice(invoiceRecordId)))).toBe(true)
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      if (requestId) {
        const { error } = await supabase.from('tax_invoice_requests').update({
          status: 'failed', dedup_state: 'cancelled', is_deleted: true,
          deleted_at: new Date().toISOString(), dedup_error: 'Production live test cleaned up',
        }).eq('id', requestId)
        if (error) cleanupErrors.push(error)
      }
      if (cleanupErrors.length) throw cleanupErrors[0]
    }
  }, 120_000)
})
