import { createApprovedJournal, getChartOfAccounts, voidJournalEntry } from './flowaccount'
import { syncBankTransferJournal, type JournalAccount } from './bankTransferJournal'
import type { SupabaseClient } from '@supabase/supabase-js'

const CASH_ACCOUNT_CODE = '11111'

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
        const cash = chart.find(account => account.code === CASH_ACCOUNT_CODE)
        if (!cash) throw new Error(`ไม่พบบัญชี ${CASH_ACCOUNT_CODE} เงินสดในมือใน FlowAccount`)
        cashAccount = { chartOfAccountId: cash.id, label: cash.nameLocal }
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
      const { error: updateError } = await supabase.from('bank_transfers').update({
        flowaccount_journal_record_id: result.recordId,
        flowaccount_journal_serial: result.documentSerial,
        flowaccount_synced_at: new Date().toISOString(),
        flowaccount_sync_error: null,
      }).eq('id', id)
      if (updateError) throw new Error(`สร้าง ${result.documentSerial} แล้ว แต่บันทึกเลขเอกสารกลับ KINTSU ไม่สำเร็จ: ${updateError.message}`)
    }

    return { ok: true as const, ...result }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'ส่งเข้า FlowAccount ไม่สำเร็จ'
    await supabase.from('bank_transfers').update({ flowaccount_sync_error: message }).eq('id', id)
    return { ok: false as const, error: message }
  }
}

export async function voidBankTransferJournal(recordId: number) {
  try {
    await voidJournalEntry(recordId)
    return { ok: true as const }
  } catch (caught) {
    return { ok: false as const, error: caught instanceof Error ? caught.message : 'ยกเลิก JV ใน FlowAccount ไม่สำเร็จ' }
  }
}
