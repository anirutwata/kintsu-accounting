import { createApprovedJournal, getChartOfAccounts, voidJournalEntry, type FlowAccountChartOfAccount } from './flowaccount'
import { syncBankTransferJournal, type JournalAccount } from './bankTransferJournal'
import type { SupabaseClient } from '@supabase/supabase-js'

const CASH_ACCOUNT_CODE = '11112'

export function resolveCashJournalAccount(
  chart: Array<Pick<FlowAccountChartOfAccount, 'id' | 'code' | 'nameLocal'>>,
): JournalAccount {
  const cash = chart.find(account => account.code === CASH_ACCOUNT_CODE)
  if (!cash) throw new Error(`ไม่พบบัญชี ${CASH_ACCOUNT_CODE} เงินสดคงเหลือใน FlowAccount`)
  return { chartOfAccountId: cash.id, label: cash.nameLocal }
}

function normalizedAccountNumber(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

interface TransferRow {
  id: string
  date: string
  amount_satang: number
  from_bank: string
  from_account: string | null
  to_bank: string
  to_account: string | null
  note: string | null
  flowaccount_journal_record_id: number | null
  flowaccount_journal_serial: string | null
  flowaccount_journal_state: 'idle' | 'creating' | 'synced' | 'voiding' | 'void_pending' | 'cleanup_pending' | 'error'
  flowaccount_cleanup_record_id: number | null
}

interface LocalBankMapping {
  bank_name: string
  account_number: string
  flowaccount_chart_of_account_id: number | null
}

async function resolveAccounts(supabase: SupabaseClient, transfer: TransferRow): Promise<{ from: JournalAccount; to: JournalAccount }> {
  const { data: localBanks, error } = await supabase
    .from('bank_accounts')
    .select('bank_name, account_number, flowaccount_chart_of_account_id')
  if (error) throw new Error(error.message)

  let cashAccount: JournalAccount | null = null
  const resolve = async (bankName: string, accountNumber: string | null): Promise<JournalAccount> => {
    if (bankName.trim().toLowerCase() === 'เงินสด') {
      if (!cashAccount) {
        const chart = await getChartOfAccounts()
        cashAccount = resolveCashJournalAccount(chart)
      }
      return cashAccount
    }

    const digits = normalizedAccountNumber(accountNumber)
    const localBank = (localBanks as LocalBankMapping[] | null)?.find(candidate =>
      normalizedAccountNumber(candidate.account_number) === digits,
    )
    if (!localBank?.flowaccount_chart_of_account_id) {
      throw new Error(`บัญชี ${bankName} ${accountNumber ?? ''} ยังไม่ได้ผูกกับผังบัญชี FlowAccount`)
    }
    return {
      chartOfAccountId: Number(localBank.flowaccount_chart_of_account_id),
      label: `${localBank.bank_name} ${localBank.account_number}`,
    }
  }

  const [from, to] = await Promise.all([
    resolve(transfer.from_bank, transfer.from_account),
    resolve(transfer.to_bank, transfer.to_account),
  ])
  return { from, to }
}

export async function syncBankTransferToFlowAccount(supabase: SupabaseClient, id: string) {
  const { data: transfer, error } = await supabase
    .from('bank_transfers')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle()
  if (error) return { ok: false as const, error: error.message }
  if (!transfer) return { ok: false as const, error: 'ไม่พบรายการโอนเงิน' }

  if (transfer.flowaccount_journal_state === 'voiding' || transfer.flowaccount_journal_state === 'void_pending') {
    return { ok: false as const, error: 'JV เดิมถูก Void แล้ว กรุณาบันทึกการแก้ไขหรือลบรายการนี้ให้เสร็จ' }
  }

  if (transfer.flowaccount_journal_state === 'cleanup_pending') {
    if (!transfer.flowaccount_cleanup_record_id) {
      return { ok: false as const, error: 'รายการรอ cleanup แต่ไม่มี FlowAccount record ID กรุณาติดต่อผู้ดูแลระบบ' }
    }
    const cleanup = await voidBankTransferJournal(transfer.flowaccount_cleanup_record_id, true)
    if (!cleanup.ok) return { ok: false as const, error: `ยัง cleanup JV เดิมไม่สำเร็จ: ${cleanup.error}` }
    const { error: resetError } = await supabase.from('bank_transfers').update({
      flowaccount_journal_state: 'idle',
      flowaccount_cleanup_record_id: null,
      flowaccount_state_changed_at: new Date().toISOString(),
      flowaccount_sync_error: null,
    }).eq('id', id).eq('flowaccount_journal_state', 'cleanup_pending')
    if (resetError) return { ok: false as const, error: `cleanup JV สำเร็จ แต่ reset สถานะ KINTSU ไม่สำเร็จ: ${resetError.message}` }
    transfer.flowaccount_journal_state = 'idle'
    transfer.flowaccount_cleanup_record_id = null
  }

  if (!transfer.flowaccount_journal_record_id) {
    const { data: claim, error: claimError } = await supabase
      .from('bank_transfers')
      .update({ flowaccount_journal_state: 'creating', flowaccount_state_changed_at: new Date().toISOString(), flowaccount_sync_error: null })
      .eq('id', id)
      .eq('is_deleted', false)
      .is('flowaccount_journal_record_id', null)
      .in('flowaccount_journal_state', ['idle', 'error'])
      .select('id')
      .maybeSingle()
    if (claimError) return { ok: false as const, error: claimError.message }
    if (!claim) {
      const { data: latest } = await supabase
        .from('bank_transfers')
        .select('flowaccount_journal_record_id, flowaccount_journal_serial, flowaccount_journal_state')
        .eq('id', id)
        .maybeSingle()
      if (latest?.flowaccount_journal_record_id && latest.flowaccount_journal_serial) {
        return { ok: true as const, recordId: latest.flowaccount_journal_record_id, documentSerial: latest.flowaccount_journal_serial, created: false }
      }
      return { ok: false as const, error: latest?.flowaccount_journal_state === 'creating' ? 'รายการนี้กำลังส่งเข้า FlowAccount อยู่' : 'ไม่สามารถจองรายการสำหรับส่ง FlowAccount ได้' }
    }
  }

  try {
    const accounts = await resolveAccounts(supabase, transfer as TransferRow)
    const result = await syncBankTransferJournal({
      id: transfer.id,
      date: transfer.date,
      amountSatang: transfer.amount_satang,
      note: transfer.note,
      from: accounts.from,
      to: accounts.to,
      flowAccountRecordId: transfer.flowaccount_journal_record_id,
      flowAccountDocumentSerial: transfer.flowaccount_journal_serial,
    }, { createApprovedJournal })

    if (result.created) {
      const { data: persisted, error: updateError } = await supabase.from('bank_transfers').update({
        flowaccount_journal_record_id: result.recordId,
        flowaccount_journal_serial: result.documentSerial,
        flowaccount_journal_state: 'synced',
        flowaccount_cleanup_record_id: null,
        flowaccount_state_changed_at: new Date().toISOString(),
        flowaccount_synced_at: new Date().toISOString(),
        flowaccount_sync_error: null,
      }).eq('id', id).eq('is_deleted', false).eq('flowaccount_journal_state', 'creating').select('id').maybeSingle()
      if (updateError || !persisted) {
        const cleanup = await voidBankTransferJournal(result.recordId)
        const cleanupDetail = cleanup.ok ? 'ระบบ Void เอกสารที่เพิ่งสร้างให้แล้ว' : `ต้อง Void recordId ${result.recordId} ด้วยมือ: ${cleanup.error}`
        const persistenceDetail = updateError?.message ?? 'สถานะรายการเปลี่ยนระหว่างส่งข้อมูล'
        const message = `สร้าง ${result.documentSerial} แล้ว แต่บันทึกเลขเอกสารกลับ KINTSU ไม่สำเร็จ: ${persistenceDetail} (${cleanupDetail})`
        await supabase.from('bank_transfers').update({
          flowaccount_journal_state: cleanup.ok ? 'error' : 'cleanup_pending',
          flowaccount_cleanup_record_id: cleanup.ok ? null : result.recordId,
          flowaccount_state_changed_at: new Date().toISOString(),
          flowaccount_sync_error: message,
        }).eq('id', id)
        return { ok: false as const, error: message, cleanupRequiredRecordId: cleanup.ok ? null : result.recordId }
      }
    }

    return { ok: true as const, ...result }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'ส่งเข้า FlowAccount ไม่สำเร็จ'
    await supabase.from('bank_transfers').update({ flowaccount_journal_state: 'error', flowaccount_state_changed_at: new Date().toISOString(), flowaccount_sync_error: message }).eq('id', id).eq('flowaccount_journal_state', 'creating')
    return { ok: false as const, error: message }
  }
}

export async function voidBankTransferJournal(recordId: number, allowAlreadyVoided = false) {
  try {
    await voidJournalEntry(recordId)
    return { ok: true as const }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'ยกเลิก JV ใน FlowAccount ไม่สำเร็จ'
    if (allowAlreadyVoided && message.includes('invalid status')) return { ok: true as const }
    return { ok: false as const, error: message }
  }
}
