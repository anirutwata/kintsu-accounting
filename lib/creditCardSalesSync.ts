import type { SupabaseClient } from '@supabase/supabase-js'
import { createCashInvoice, getCashInvoice, resolveTaxInvoicePayment, voidCashInvoice } from './flowaccount'
import { resolveDefaultPaymentConfig } from './paymentConfig'

async function ensureCashInvoiceVoided(recordId: number) {
  const response = await getCashInvoice(recordId)
  const document = response?.list?.[0] ?? response
  if (String(document?.statusString || '').toLowerCase() === 'void') return
  await voidCashInvoice(recordId)
}

export async function syncCreditCardCashSale(supabase: SupabaseClient, date: string) {
  const { data: sale, error } = await supabase.from('daily_sales').select('*').eq('id', date).maybeSingle()
  if (error) return { ok: false as const, error: error.message }
  if (!sale) return { ok: false as const, error: 'ไม่พบยอดขายวันนี้' }
  const amountSatang = Number(sale.credit_card_satang || 0) + Number(sale.papaya_credit_card_satang || 0)
  if (amountSatang <= 0) return { ok: true as const, skipped: true }

  if (sale.flowaccount_credit_card_sync_state === 'cleanup_pending') {
    if (!sale.flowaccount_credit_card_cleanup_record_id) return { ok: false as const, error: 'Cash Sale รอ cleanup แต่ไม่มี record ID' }
    try {
      await ensureCashInvoiceVoided(sale.flowaccount_credit_card_cleanup_record_id)
    } catch (cleanupError) {
      return { ok: false as const, error: `ยัง cleanup Cash Sale ไม่สำเร็จ: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}` }
    }
    const { data: reset, error: resetError } = await supabase.from('daily_sales').update({
      flowaccount_credit_card_sync_state: 'idle', flowaccount_credit_card_cleanup_record_id: null,
      flowaccount_credit_card_sync_error: null,
    }).eq('id', date).eq('flowaccount_credit_card_sync_state', 'cleanup_pending').select('id').maybeSingle()
    if (resetError || !reset) return { ok: false as const, error: `cleanup สำเร็จแต่ reset KINTSU ไม่สำเร็จ: ${resetError?.message || 'สถานะถูกเปลี่ยน'}` }
  }

  if (sale.flowaccount_credit_card_record_id && sale.flowaccount_credit_card_document_serial) {
    return {
      ok: true as const, recordId: sale.flowaccount_credit_card_record_id,
      documentSerial: sale.flowaccount_credit_card_document_serial, created: false,
    }
  }

  const { data: claimed, error: claimError } = await supabase.from('daily_sales').update({
    flowaccount_credit_card_sync_state: 'creating', flowaccount_credit_card_sync_error: null,
  }).eq('id', date).is('flowaccount_credit_card_record_id', null)
    .in('flowaccount_credit_card_sync_state', ['idle', 'error']).select('id').maybeSingle()
  if (claimError) return { ok: false as const, error: claimError.message }
  if (!claimed) return { ok: false as const, error: 'บัตรเครดิตกำลังส่งเข้า FlowAccount หรือส่งแล้ว' }

  try {
    const combinedRevenue = Number(sale.dine_in_revenue_satang || 0) + Number(sale.papaya_revenue_satang || 0)
    const combinedVat = Number(sale.vat_amount_satang || 0) + Number(sale.papaya_vat_satang || 0)
    const vatSatang = combinedRevenue > 0 ? Math.round((combinedVat * amountSatang) / combinedRevenue) : 0
    const paymentConfig = await resolveDefaultPaymentConfig(supabase)
    const result = await createCashInvoice({
      contactName: 'ลูกค้าทั่วไป', publishedOn: date,
      remarks: `สรุปยอดขายวันที่ ${date} - บัตรเครดิต (Dine-in/Papaya)`,
      items: [{
        name: `ยอดขายวันที่ ${date} - บัตรเครดิต`, quantity: 1, unitName: 'วัน',
        pricePerUnit: (amountSatang - vatSatang) / 100,
      }],
      payment: resolveTaxInvoicePayment('credit_card', date, 0, paymentConfig),
    })
    const { data: saved, error: saveError } = await supabase.from('daily_sales').update({
      flowaccount_credit_card_record_id: result.recordId,
      flowaccount_credit_card_document_serial: result.documentSerial,
      flowaccount_credit_card_synced_at: new Date().toISOString(),
      flowaccount_credit_card_synced_amount_satang: amountSatang,
      flowaccount_credit_card_sync_state: 'synced', flowaccount_credit_card_sync_error: null,
    }).eq('id', date).eq('flowaccount_credit_card_sync_state', 'creating')
      .is('flowaccount_credit_card_record_id', null).select('id').maybeSingle()
    if (saveError || !saved) {
      try {
        await ensureCashInvoiceVoided(result.recordId)
      } catch (cleanupError) {
        const { data: cleanupState, error: cleanupStateError } = await supabase.from('daily_sales').update({
          flowaccount_credit_card_sync_state: 'cleanup_pending',
          flowaccount_credit_card_cleanup_record_id: result.recordId,
          flowaccount_credit_card_sync_error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        }).eq('id', date).eq('flowaccount_credit_card_sync_state', 'creating').select('id').maybeSingle()
        return {
          ok: false as const,
          error: cleanupStateError || !cleanupState
            ? `มี Cash Sale รอ Void และบันทึกสถานะ cleanup ไม่สำเร็จ: ${cleanupStateError?.message || 'สถานะถูกเปลี่ยน'}`
            : 'มี Cash Sale รอ Void ระบบจะ cleanup ก่อนสร้างใหม่',
          cleanupRequiredRecordId: result.recordId,
        }
      }
      await supabase.from('daily_sales').update({
        flowaccount_credit_card_sync_state: 'error',
        flowaccount_credit_card_sync_error: saveError?.message || 'สถานะถูกเปลี่ยน',
      }).eq('id', date).eq('flowaccount_credit_card_sync_state', 'creating')
      return { ok: false as const, error: 'สร้าง Cash Sale แล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ และ Void เรียบร้อยแล้ว' }
    }
    return { ok: true as const, recordId: result.recordId, documentSerial: result.documentSerial, created: true }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    await supabase.from('daily_sales').update({
      flowaccount_credit_card_sync_state: 'error', flowaccount_credit_card_sync_error: message,
    }).eq('id', date).eq('flowaccount_credit_card_sync_state', 'creating')
    return { ok: false as const, error: message }
  }
}
