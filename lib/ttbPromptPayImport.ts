import { createHash } from 'node:crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createApprovedJournal, getChartOfAccounts, voidJournalEntry } from './flowaccount'
import { readEncryptedTtbReport } from './ttbPromptPayWorkbook'
import { syncRevenueJournal, type RevenueJournalAccount } from './revenueJournal'

const REPORT_SENDER = 'ttbsmartshop@digio.co.th'
const REPORT_SUBJECT = 'ttb smart shop: รายงานการขายประจำวัน (Daily Sales Report)'

export function expectedTtbReportDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
  return formatter.format(new Date(Date.now() - 86_400_000))
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า ${name}`)
  return value
}

async function findReportMessages(): Promise<Array<{ messageId: string; attachmentName: string; content: Buffer }>> {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: requiredEnv('KINTSU_EMAIL_ADDRESS'), pass: requiredEnv('KINTSU_EMAIL_APP_PASSWORD') },
    logger: false,
  })
  const found: Array<{ messageId: string; attachmentName: string; content: Buffer }> = []
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    const uids = await client.search({ gmraw: `from:${REPORT_SENDER} subject:"${REPORT_SUBJECT}" newer_than:3d has:attachment` }, { uid: true })
    for (const uid of (uids || []).slice(-20)) {
      const message = await client.fetchOne(uid, { source: true }, { uid: true })
      if (!message || !message.source) continue
      const parsed = await simpleParser(message.source)
      const senders = parsed.from?.value.map(item => item.address?.toLowerCase()).filter(Boolean) || []
      if (senders.length !== 1 || senders[0] !== REPORT_SENDER || parsed.subject !== REPORT_SUBJECT) continue
      const messageId = parsed.messageId || `gmail-uid-${uid}`
      for (const attachment of parsed.attachments) {
        if (!/\.xlsx$/i.test(attachment.filename || '')) continue
        found.push({ messageId, attachmentName: attachment.filename || 'ttb-report.xlsx', content: attachment.content })
      }
    }
  } finally {
    lock.release()
    await client.logout().catch(() => undefined)
  }
  return found
}

async function resolveConfiguredBank(supabase: SupabaseClient) {
  const { data: settings, error: settingsError } = await supabase.rpc('get_settings')
  if (settingsError) throw settingsError
  if (!settings?.ttb_promptpay_bank_account_id) throw new Error('ยังไม่ได้เลือกบัญชี TTB Smart Shop ใน ตั้งค่า > ระบบ')
  const { data: bank, error } = await supabase.from('bank_accounts')
    .select('id, bank_name, account_number, flowaccount_chart_of_account_id')
    .eq('id', settings.ttb_promptpay_bank_account_id).eq('is_active', true).single()
  if (error || !bank) throw new Error('ไม่พบบัญชี TTB Smart Shop ที่ตั้งค่าไว้')
  if (String(bank.account_number || '').replace(/\D/g, '') !== '7602315983') {
    throw new Error('บัญชี TTB Smart Shop ต้องเป็น 760-2-31598-3 เท่านั้น')
  }
  if (!bank.flowaccount_chart_of_account_id) throw new Error('บัญชี TTB Smart Shop ยังไม่ได้ผูกกับผังบัญชี FlowAccount')
  return bank
}

async function ensureJournalVoided(recordId: number) {
  try {
    await voidJournalEntry(recordId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('invalid status')) throw error
  }
}

async function resolveJournalAccounts(bankChartId: number): Promise<{ debit: RevenueJournalAccount; revenue: RevenueJournalAccount }> {
  const chart = await getChartOfAccounts()
  const revenue = chart.find(account => account.code === '41210')
  if (!revenue) throw new Error('ไม่พบบัญชี 41210 รายได้จากการให้บริการใน FlowAccount')
  const debit = chart.find(account => account.id === bankChartId)
  if (!debit || debit.code !== '11122.07') {
    throw new Error('บัญชี TTB 7602315983 ต้องผูกกับผังบัญชี 11122.07 เท่านั้น')
  }
  return {
    debit: { chartOfAccountId: debit.id, code: debit.code, label: debit.nameLocal },
    revenue: { chartOfAccountId: revenue.id, code: revenue.code, label: revenue.nameLocal },
  }
}

export async function syncTtbReportToFlowAccount(supabase: SupabaseClient, reportId: string) {
  const { data: report, error } = await supabase.from('ttb_promptpay_reports').select('*')
    .eq('id', reportId).eq('is_deleted', false).single()
  if (error || !report) return { ok: false as const, error: error?.message || 'ไม่พบรายงาน TTB' }
  if (report.sync_state === 'cleanup_pending' && report.flowaccount_record_id) {
    try {
      await ensureJournalVoided(report.flowaccount_record_id)
      const { data: cleaned } = await supabase.from('ttb_promptpay_reports').update({
        flowaccount_record_id: null, flowaccount_document_serial: null, flowaccount_synced_at: null,
        sync_state: 'idle', sync_error: null, updated_at: new Date().toISOString(),
      }).eq('id', reportId).eq('sync_state', 'cleanup_pending')
        .eq('flowaccount_record_id', report.flowaccount_record_id).select('id').maybeSingle()
      if (!cleaned) return { ok: false as const, error: 'Void เอกสารค้างสำเร็จ แต่ปรับสถานะ KINTSU ไม่สำเร็จ กรุณาติดต่อผู้ดูแลก่อนลองใหม่' }
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      return { ok: false as const, error: `ยัง Void เอกสาร FlowAccount ที่ค้างไม่สำเร็จ: ${message}` }
    }
  } else if (report.flowaccount_record_id && report.flowaccount_document_serial) {
    if (String(report.flowaccount_document_serial).startsWith('CA')) {
      return { ok: false as const, error: 'รายงานนี้ยังผูกกับ Cash Sale เดิม ต้องย้ายเป็น JV ก่อน' }
    }
    return { ok: true as const, recordId: report.flowaccount_record_id, documentSerial: report.flowaccount_document_serial, created: false }
  }
  const { data: claimed } = await supabase.from('ttb_promptpay_reports').update({ sync_state: 'creating', sync_error: null })
    .eq('id', reportId).in('sync_state', ['idle', 'error']).is('flowaccount_record_id', null).select('id').maybeSingle()
  if (!claimed) return { ok: false as const, error: 'รายงานนี้กำลังส่งเข้า FlowAccount หรือถูกส่งไปแล้ว' }

  try {
    const bank = await resolveConfiguredBank(supabase)
    const accounts = await resolveJournalAccounts(Number(bank.flowaccount_chart_of_account_id))
    const result = await syncRevenueJournal({
      source: 'ttb_promptpay', date: report.report_date,
      amountSatang: report.successful_amount_satang,
      debitAccount: { ...accounts.debit, label: `${bank.bank_name} ${bank.account_number}` },
      revenueAccount: accounts.revenue,
    }, { createApprovedJournal })
    const { data: saved } = await supabase.from('ttb_promptpay_reports').update({
      flowaccount_record_id: result.recordId, flowaccount_document_serial: result.documentSerial,
      flowaccount_synced_at: new Date().toISOString(), sync_state: 'synced', sync_error: null, updated_at: new Date().toISOString(),
    }).eq('id', reportId).eq('sync_state', 'creating').is('flowaccount_record_id', null).select('id').maybeSingle()
    if (!saved) {
      try {
        await ensureJournalVoided(result.recordId)
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        const { data: cleanupState, error: cleanupStateError } = await supabase.from('ttb_promptpay_reports').update({
          flowaccount_record_id: result.recordId, flowaccount_document_serial: result.documentSerial,
          sync_state: 'cleanup_pending',
          sync_error: `สร้างเอกสารแล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ และยัง Void ไม่สำเร็จ: ${cleanupMessage}`,
          updated_at: new Date().toISOString(),
        }).eq('id', reportId).eq('sync_state', 'creating').select('id').maybeSingle()
        return {
          ok: false as const,
          error: cleanupStateError || !cleanupState
            ? `มี JV รอ Void และบันทึกสถานะ cleanup ไม่สำเร็จ: ${cleanupStateError?.message || 'สถานะถูกเปลี่ยน'}`
            : 'มี JV รอ Void ระบบจะเก็บกวาดก่อนสร้างใหม่ในการลองครั้งถัดไป',
          cleanupRequiredRecordId: result.recordId,
        }
      }
      throw new Error('สร้างเอกสารแล้วแต่บันทึกเลขกลับ KINTSU ไม่สำเร็จ และ Void เอกสารสำเร็จแล้ว')
    }
    return { ok: true as const, recordId: result.recordId, documentSerial: result.documentSerial, created: true }
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message : String(syncError)
    await supabase.from('ttb_promptpay_reports').update({ sync_state: 'error', sync_error: message, updated_at: new Date().toISOString() })
      .eq('id', reportId).eq('sync_state', 'creating')
    return { ok: false as const, error: message }
  }
}

async function importAttachment(supabase: SupabaseClient, input: { messageId: string; attachmentName: string; content: Buffer }) {
  const sha256 = createHash('sha256').update(input.content).digest('hex')
  // Validate the bank document on every run, including legacy rows imported
  // before filename/summary cross-checking existed. Nothing may repair KINTSU
  // or reach FlowAccount until the current attachment passes all date checks.
  const report = await readEncryptedTtbReport(
    input.content,
    requiredEnv('TTB_SMARTSHOP_REPORT_PASSWORD'),
    input.attachmentName,
  )
  if (report.reportDate !== expectedTtbReportDate()) {
    return { imported: false, skipped: true, reportDate: report.reportDate, reason: `รอเฉพาะรายงาน D-1 (${expectedTtbReportDate()})` }
  }
  const { data: existingByMessage } = await supabase.from('ttb_promptpay_reports').select('id, report_date, successful_amount_satang')
    .eq('gmail_message_id', input.messageId).eq('is_deleted', false).maybeSingle()
  const { data: existingByHash } = existingByMessage ? { data: null } : await supabase.from('ttb_promptpay_reports').select('id, report_date, successful_amount_satang')
    .eq('attachment_sha256', sha256).eq('is_deleted', false).maybeSingle()
  const existing = existingByMessage ?? existingByHash
  if (existing) {
    if (existing.report_date !== report.reportDate || Number(existing.successful_amount_satang) !== report.successfulAmountSatang) {
      throw new Error('ข้อมูลรายงาน TTB เดิมใน KINTSU ไม่ตรงกับไฟล์ธนาคาร กรุณาตรวจสอบก่อน Sync')
    }
    const { error: repairError } = await supabase.from('daily_sales').upsert({
      id: existing.report_date, date: existing.report_date,
      ttb_promptpay_satang: existing.successful_amount_satang,
      ttb_promptpay_report_id: existing.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (repairError) throw repairError
    return { imported: false, reportId: existing.id, reportDate: existing.report_date }
  }

  const bank = await resolveConfiguredBank(supabase)
  const { data: inserted, error } = await supabase.from('ttb_promptpay_reports').insert({
    report_date: report.reportDate, gmail_message_id: input.messageId, attachment_sha256: sha256,
    attachment_name: input.attachmentName, merchant_id: report.merchantId,
    successful_count: report.successfulCount, successful_amount_satang: report.successfulAmountSatang,
    voided_count: report.voidedCount, voided_amount_satang: report.voidedAmountSatang, bank_account_id: bank.id,
  }).select('id').single()
  if (error || !inserted) throw error || new Error('บันทึกรายงาน TTB ไม่สำเร็จ')

  const transactionRows = report.transactions.map(item => ({
    report_id: inserted.id, bank_reference: item.bankReference, payment_date: item.paymentDate,
    payment_time: item.paymentTime, amount_satang: item.amountSatang, status: item.status,
    payment_channel: item.paymentChannel, payer_bank: item.payerBank, payer_name: item.payerName,
  }))
  const { error: txError } = await supabase.from('ttb_promptpay_transactions').insert(transactionRows)
  if (txError) {
    await supabase.from('ttb_promptpay_reports').update({ is_deleted: true, deleted_at: new Date().toISOString(), sync_state: 'error', sync_error: txError.message }).eq('id', inserted.id)
    throw txError
  }

  const { error: salesError } = await supabase.from('daily_sales').upsert({
    id: report.reportDate, date: report.reportDate, ttb_promptpay_satang: report.successfulAmountSatang,
    ttb_promptpay_report_id: inserted.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (salesError) {
    const deletedAt = new Date().toISOString()
    await supabase.from('ttb_promptpay_transactions').update({ is_deleted: true, deleted_at: deletedAt })
      .eq('report_id', inserted.id).eq('is_deleted', false)
    await supabase.from('ttb_promptpay_reports').update({
      is_deleted: true, deleted_at: deletedAt, sync_state: 'error', sync_error: salesError.message,
    }).eq('id', inserted.id)
    throw salesError
  }
  return { imported: true, reportId: inserted.id, reportDate: report.reportDate }
}

export async function importTtbPromptPayFromGmail(supabase: SupabaseClient) {
  const messages = await findReportMessages()
  const results = []
  for (const message of messages) {
    const imported = await importAttachment(supabase, message)
    if ('skipped' in imported && imported.skipped) {
      results.push(imported)
      continue
    }
    const sync = await syncTtbReportToFlowAccount(supabase, imported.reportId)
    results.push({ ...imported, sync })
  }
  const expectedDate = expectedTtbReportDate()
  const expected = results.find(result => result.reportDate === expectedDate && !('skipped' in result && result.skipped))
  if (!expected) throw new Error(`ไม่พบรายงาน TTB Smart Shop ของวันที่ ${expectedDate}`)
  if ('sync' in expected && expected.sync && !expected.sync.ok) throw new Error(expected.sync.error)
  return { scanned: messages.length, results }
}
