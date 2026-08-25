import type { SupabaseClient } from '@supabase/supabase-js'
import { createApprovedJournal, getChartOfAccounts, voidJournalEntry } from './flowaccount'
import { resolveCashJournalAccount } from './bankTransferSync'
import { syncRevenueJournal, type RevenueJournalAccount } from './revenueJournal'

async function voidRevenueJournal(recordId: number, allowAlreadyVoided = false) {
  try {
    await voidJournalEntry(recordId)
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (allowAlreadyVoided && message.includes('invalid status')) return { ok: true as const }
    return { ok: false as const, error: message }
  }
}

function resolveServiceRevenueAccount(chart: Awaited<ReturnType<typeof getChartOfAccounts>>): RevenueJournalAccount {
  const revenue = chart.find(account => account.code === '41210')
  if (!revenue) throw new Error('ไม่พบบัญชี 41210 รายได้จากการให้บริการใน FlowAccount')
  return { chartOfAccountId: revenue.id, code: revenue.code, label: revenue.nameLocal }
}

export async function syncCashRevenueToFlowAccount(supabase: SupabaseClient, date: string) {
  const { data: sale, error } = await supabase.from('daily_sales').select('*').eq('id', date).maybeSingle()
  if (error) return { ok: false as const, error: error.message }
  if (!sale) return { ok: false as const, error: 'ไม่พบยอดขายวันนี้' }

  const amountSatang = Number(sale.cash_satang || 0) + Number(sale.papaya_cash_satang || 0)

  if (sale.flowaccount_cash_journal_state === 'voiding' && sale.flowaccount_cash_record_id) {
    const resumedVoid = await voidRevenueJournal(sale.flowaccount_cash_record_id, true)
    if (!resumedVoid.ok) return { ok: false as const, error: `ยัง Void JV เงินสดเดิมไม่สำเร็จ: ${resumedVoid.error}` }
    const { data: resumed, error: resumeError } = await supabase.from('daily_sales').update({
      flowaccount_cash_record_id: null, flowaccount_cash_document_serial: null,
      flowaccount_cash_synced_at: null, flowaccount_cash_synced_amount_satang: null,
      flowaccount_cash_journal_state: 'idle', flowaccount_cash_sync_error: null,
      flowaccount_cash_state_changed_at: new Date().toISOString(),
    }).eq('id', date).eq('flowaccount_cash_journal_state', 'voiding')
      .eq('flowaccount_cash_record_id', sale.flowaccount_cash_record_id).select('id').maybeSingle()
    if (resumeError || !resumed) {
      return { ok: false as const, error: `Void JV แล้วแต่กู้สถานะ KINTSU ไม่สำเร็จ: ${resumeError?.message || 'สถานะถูกเปลี่ยน'}` }
    }
    sale.flowaccount_cash_record_id = null
    sale.flowaccount_cash_document_serial = null
    sale.flowaccount_cash_journal_state = 'idle'
  }

  if (sale.flowaccount_cash_journal_state === 'cleanup_pending') {
    if (!sale.flowaccount_cash_cleanup_record_id) {
      return { ok: false as const, error: 'รายการรอ cleanup แต่ไม่มี FlowAccount record ID' }
    }
    const cleanup = await voidRevenueJournal(sale.flowaccount_cash_cleanup_record_id, true)
    if (!cleanup.ok) return { ok: false as const, error: `ยัง cleanup JV เดิมไม่สำเร็จ: ${cleanup.error}` }
    const { error: resetError } = await supabase.from('daily_sales').update({
      flowaccount_cash_journal_state: 'idle', flowaccount_cash_cleanup_record_id: null,
      flowaccount_cash_sync_error: null, flowaccount_cash_state_changed_at: new Date().toISOString(),
    }).eq('id', date).eq('flowaccount_cash_journal_state', 'cleanup_pending')
    if (resetError) return { ok: false as const, error: `cleanup สำเร็จแต่ reset KINTSU ไม่สำเร็จ: ${resetError.message}` }
    sale.flowaccount_cash_journal_state = 'idle'
  }

  if (sale.flowaccount_cash_record_id && sale.flowaccount_cash_document_serial) {
    if (String(sale.flowaccount_cash_document_serial).startsWith('CA')) {
      return { ok: false as const, error: 'ยอดเงินสดยังผูกกับ Cash Sale เดิม ต้องย้ายเป็น JV ก่อน' }
    }
    if (sale.flowaccount_cash_synced_amount_satang === amountSatang) {
      return {
        ok: true as const, recordId: sale.flowaccount_cash_record_id,
        documentSerial: sale.flowaccount_cash_document_serial, created: false,
      }
    }

    const { data: voidClaim } = await supabase.from('daily_sales').update({
      flowaccount_cash_journal_state: 'voiding', flowaccount_cash_state_changed_at: new Date().toISOString(),
    }).eq('id', date).eq('flowaccount_cash_journal_state', 'synced')
      .eq('flowaccount_cash_record_id', sale.flowaccount_cash_record_id).select('id').maybeSingle()
    if (!voidClaim) return { ok: false as const, error: 'มีการแก้ไขหรือ Sync เงินสดพร้อมกัน กรุณาลองใหม่' }
    const voided = await voidRevenueJournal(sale.flowaccount_cash_record_id, true)
    if (!voided.ok) {
      await supabase.from('daily_sales').update({
        flowaccount_cash_journal_state: 'synced', flowaccount_cash_sync_error: voided.error,
      }).eq('id', date).eq('flowaccount_cash_journal_state', 'voiding')
      return { ok: false as const, error: `Void JV เงินสดเดิมไม่สำเร็จ: ${voided.error}` }
    }
    const { data: cleared, error: clearError } = await supabase.from('daily_sales').update({
      flowaccount_cash_record_id: null, flowaccount_cash_document_serial: null,
      flowaccount_cash_synced_at: null, flowaccount_cash_synced_amount_satang: null,
      flowaccount_cash_journal_state: 'idle', flowaccount_cash_sync_error: null,
      flowaccount_cash_state_changed_at: new Date().toISOString(),
    }).eq('id', date).eq('flowaccount_cash_journal_state', 'voiding')
      .eq('flowaccount_cash_record_id', sale.flowaccount_cash_record_id).select('id').maybeSingle()
    if (clearError || !cleared) {
      return { ok: false as const, error: `Void JV แล้วแต่ล้างสถานะ KINTSU ไม่สำเร็จ: ${clearError?.message || 'สถานะถูกเปลี่ยน'}` }
    }
  }

  if (amountSatang <= 0) return { ok: true as const, skipped: true, reason: 'ยอดเงินสดเป็น 0 บาท และไม่มี JV ค้าง' }

  const { data: claimed, error: claimError } = await supabase.from('daily_sales').update({
    flowaccount_cash_journal_state: 'creating', flowaccount_cash_sync_error: null,
    flowaccount_cash_state_changed_at: new Date().toISOString(),
  }).eq('id', date).is('flowaccount_cash_record_id', null)
    .in('flowaccount_cash_journal_state', ['idle', 'error']).select('id').maybeSingle()
  if (claimError) return { ok: false as const, error: claimError.message }
  if (!claimed) return { ok: false as const, error: 'รายการเงินสดกำลังส่งเข้า FlowAccount หรือส่งแล้ว' }

  try {
    const chart = await getChartOfAccounts()
    const cash = resolveCashJournalAccount(chart)
    const result = await syncRevenueJournal({
      source: 'cash', date, amountSatang,
      debitAccount: { ...cash, code: '11112' },
      revenueAccount: resolveServiceRevenueAccount(chart),
    }, { createApprovedJournal })

    const { data: saved, error: saveError } = await supabase.from('daily_sales').update({
      flowaccount_cash_record_id: result.recordId,
      flowaccount_cash_document_serial: result.documentSerial,
      flowaccount_cash_synced_at: new Date().toISOString(),
      flowaccount_cash_synced_amount_satang: amountSatang,
      flowaccount_cash_journal_state: 'synced', flowaccount_cash_cleanup_record_id: null,
      flowaccount_cash_sync_error: null, flowaccount_cash_state_changed_at: new Date().toISOString(),
    }).eq('id', date).eq('flowaccount_cash_journal_state', 'creating')
      .is('flowaccount_cash_record_id', null).select('id').maybeSingle()
    if (saveError || !saved) {
      const cleanup = await voidRevenueJournal(result.recordId)
      const message = saveError?.message || 'สถานะรายการเปลี่ยนระหว่างส่งข้อมูล'
      const { data: cleanupState, error: cleanupStateError } = await supabase.from('daily_sales').update({
        flowaccount_cash_journal_state: cleanup.ok ? 'error' : 'cleanup_pending',
        flowaccount_cash_cleanup_record_id: cleanup.ok ? null : result.recordId,
        flowaccount_cash_sync_error: message, flowaccount_cash_state_changed_at: new Date().toISOString(),
      }).eq('id', date).eq('flowaccount_cash_journal_state', 'creating').select('id').maybeSingle()
      return {
        ok: false as const,
        error: cleanupStateError || !cleanupState
          ? `สร้าง JV แล้ว บันทึกกลับและบันทึกสถานะ cleanup ไม่สำเร็จ: ${cleanupStateError?.message || 'สถานะถูกเปลี่ยน'}`
          : `สร้าง JV แล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ: ${message}`,
        cleanupRequiredRecordId: cleanup.ok ? null : result.recordId,
      }
    }
    return { ok: true as const, ...result }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    await supabase.from('daily_sales').update({
      flowaccount_cash_journal_state: 'error', flowaccount_cash_sync_error: message,
      flowaccount_cash_state_changed_at: new Date().toISOString(),
    }).eq('id', date).eq('flowaccount_cash_journal_state', 'creating')
    return { ok: false as const, error: message }
  }
}
