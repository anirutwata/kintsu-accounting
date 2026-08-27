import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createApprovedJournal,
  createTaxInvoice,
  getChartOfAccounts,
  getJournalEntry,
  getTaxInvoice,
  resolveTaxInvoicePayment,
  voidJournalEntry,
  voidTaxInvoice,
} from './flowaccount'
import { isFlowAccountDocumentVoided } from './flowaccountVoid'
import { replaceEdcCashSaleForTaxInvoice } from './linePayEdcImport'
import { resolveDefaultPaymentConfig } from './paymentConfig'
import {
  runTaxInvoiceApprovalAccounting,
  type TaxInvoiceApprovalRecord,
} from './taxInvoiceApprovalWorkflow'
import { buildTaxInvoiceRevenueReversal } from './taxInvoiceRevenueAdjustment'

interface StoredTaxInvoiceRequest extends TaxInvoiceApprovalRecord {
  contact_name: string
  contact_tax_id: string | null
  contact_address: string | null
  contact_branch: string | null
  contact_group: 'individual' | 'juristic' | null
  description: string
  subtotal_satang: number
}

function documentFromResponse(response: unknown): Record<string, unknown> {
  const value = response as { list?: Array<Record<string, unknown>> }
  return value?.list?.[0] ?? (response as Record<string, unknown>)
}

async function ensureTaxInvoiceVoided(recordId: number): Promise<void> {
  const current = documentFromResponse(await getTaxInvoice(recordId))
  if (!isFlowAccountDocumentVoided(current)) await voidTaxInvoice(recordId)
  const verified = documentFromResponse(await getTaxInvoice(recordId))
  if (!isFlowAccountDocumentVoided(verified)) throw new Error(`ใบกำกับภาษี ${recordId} ยังไม่เป็น Void`)
}

async function ensureJournalVoided(recordId: number): Promise<void> {
  try {
    await voidJournalEntry(recordId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('invalid status')) throw error
  }
  try {
    const verified = documentFromResponse(await getJournalEntry(recordId))
    if (!isFlowAccountDocumentVoided(verified)) throw new Error(`JV ${recordId} ยังไม่เป็น Void`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // FlowAccount removes a voided JV from this record endpoint. A 404 after a
    // successful/"already changed" void is the verified terminal state.
    if (!message.includes('(404)')) throw error
  }
}

async function requireSaved<T>(operation: PromiseLike<{ data: T | null; error: { message: string } | null }>, message: string): Promise<T> {
  const { data, error } = await operation
  if (error || !data) throw new Error(`${message}: ${error?.message || 'สถานะถูกเปลี่ยน'}`)
  return data
}

export async function processApprovedTaxInvoice(
  supabase: SupabaseClient,
  requestId: string,
  today: string,
) {
  return runTaxInvoiceApprovalAccounting(requestId, {
    reserve: async id => {
      const { data, error } = await supabase.rpc('reserve_tax_invoice_revenue_v3', {
        p_request_id: id,
        p_today: today,
      })
      if (error || !data) throw new Error(error?.message || 'จองยอดรายได้สำหรับใบกำกับภาษีไม่สำเร็จ')
      return data as StoredTaxInvoiceRequest
    },
    createInvoice: async request => {
      const row = request as StoredTaxInvoiceRequest
      const paymentConfig = await resolveDefaultPaymentConfig(supabase)
      const subTotal = Number(row.subtotal_satang) / 100
      const totalBaht = Number(row.total_satang) / 100
      const vatAmount = Math.round(subTotal * 0.07 * 100) / 100
      const roundingAmount = Math.max(0, Math.round((subTotal + vatAmount - totalBaht) * 100) / 100)
      return createTaxInvoice({
        contactName: row.contact_name,
        contactTaxId: row.contact_tax_id || undefined,
        contactAddress: row.contact_address || undefined,
        contactBranch: row.contact_branch || undefined,
        contactGroup: row.contact_group || undefined,
        publishedOn: row.document_date,
        internalNotes: `ลูกค้าขอผ่าน KINTSU · request ${row.id}`,
        items: [{ name: row.description, quantity: 1, unitName: 'รายการ', pricePerUnit: subTotal }],
        payment: resolveTaxInvoicePayment(row.payment_method, row.document_date, roundingAmount, paymentConfig),
      })
    },
    saveInvoice: async (id, invoice) => {
      const { data, error } = await supabase.rpc('record_tax_invoice_created', {
        p_request_id: id,
        p_record_id: invoice.recordId,
        p_document_serial: invoice.documentSerial,
      })
      if (error || !data) throw new Error(`สร้างใบกำกับภาษีแล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ: ${error?.message || 'สถานะถูกเปลี่ยน'}`)
      return data as StoredTaxInvoiceRequest
    },
    voidInvoice: ensureTaxInvoiceVoided,
    createReversal: async (request, invoice) => {
      const chart = await getChartOfAccounts()
      const account = (code: string) => {
        const found = chart.find(item => item.code === code)
        if (!found) throw new Error(`ไม่พบบัญชี ${code} ใน FlowAccount`)
        return { chartOfAccountId: found.id, code: found.code, label: found.nameLocal }
      }
      return createApprovedJournal(buildTaxInvoiceRevenueReversal({
        requestId: request.id,
        documentDate: request.document_date,
        paymentMethod: request.payment_method,
        totalSatang: Number(request.total_satang),
        invoiceSerial: invoice.documentSerial,
        accounts: { revenue: account('41210'), cash: account('11112'), transfer: account('11122.07') },
      }))
    },
    saveCorrection: async (id, correction) => {
      await requireSaved(supabase.from('tax_invoice_requests').update({
        dedup_correction_record_id: correction.recordId,
        dedup_correction_document_serial: correction.documentSerial,
        dedup_state: 'accounting_complete',
        dedup_state_changed_at: new Date().toISOString(),
        dedup_error: null,
      }).eq('id', id).in('dedup_state', ['invoice_created', 'reserved'])
        .is('dedup_correction_record_id', null).select('id').maybeSingle(),
      'สร้างเอกสารแก้รายได้แล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ')
    },
    voidCorrection: ensureJournalVoided,
    replaceEdcCashSale: async request => {
      const { data: revenueDay, error } = await supabase.from('linepay_edc_revenue_days').select('*')
        .eq('revenue_date', request.document_date).eq('is_deleted', false).single()
      if (error || !revenueDay) throw new Error(error?.message || 'ไม่พบยอด EDC วันที่ออกใบกำกับภาษี')
      const result = await replaceEdcCashSaleForTaxInvoice(supabase, revenueDay)
      if ('recordId' in result && result.recordId && result.documentSerial) {
        return { recordId: result.recordId, documentSerial: result.documentSerial }
      }
      // A zero net amount intentionally leaves no replacement Cash Sale. The
      // original voided document is already retained in dedup_original_*.
      if ('skipped' in result && result.skipped) return null
      throw new Error('ปรับเอกสาร EDC แล้วแต่ไม่พบผลลัพธ์สำหรับบันทึก audit')
    },
    markComplete: async id => {
      await requireSaved(supabase.from('tax_invoice_requests').update({
        dedup_state: 'complete', dedup_state_changed_at: new Date().toISOString(), dedup_error: null,
      }).eq('id', id).in('dedup_state', ['invoice_created', 'accounting_complete'])
        .select('id').maybeSingle(), 'บันทึกสถานะป้องกันรายได้ซ้ำไม่สำเร็จ')
    },
  })
}
