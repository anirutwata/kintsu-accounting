import { createHash } from 'node:crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildEdcCashSale, buildEdcSettlementJournal, type EdcAccount } from './edcAccounting'
import { parseEdcDailyReport } from './edcDailyReport'
import {
  createApprovedJournal,
  createCashInvoice,
  getCashInvoice,
  getJournalEntry,
  getChartOfAccounts,
  voidCashInvoice,
  voidJournalEntry,
} from './flowaccount'
import { isFlowAccountDocumentVoided } from './flowaccountVoid'
import { LINEPAY_EDC_POLICY } from './edcPolicy'

const REPORT_SENDER = 'noreply-merchant@linepayth.com'
const REPORT_SUBJECT_PREFIX = 'รายงานสรุปยอดขาย EDC -'
interface StoredEdcReport {
  id: string
  revenue_date: string
  settlement_date: string
  gross_amount_satang: number
  fee_amount_satang: number
  fee_vat_satang: number
  net_amount_satang: number
  cash_sale_record_id: number | null
  cash_sale_document_serial: string | null
  cash_sale_sync_state: 'idle' | 'creating' | 'synced' | 'cleanup_pending' | 'error'
  cash_sale_cleanup_record_id: number | null
  settlement_record_id: number | null
  settlement_document_serial: string | null
  settlement_sync_state: 'idle' | 'creating' | 'synced' | 'cleanup_pending' | 'error'
  settlement_cleanup_record_id: number | null
}

export function expectedEdcDates(now = Date.now()): { revenueDate: string; settlementDate: string } {
  const format = (value: number) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
  return { settlementDate: format(now), revenueDate: format(now - 86_400_000) }
}

export function isExpectedEdcReport(
  report: { revenueDate: string; settlementDate: string },
  expected = expectedEdcDates(),
): boolean {
  return report.revenueDate === expected.revenueDate && report.settlementDate === expected.settlementDate
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า ${name}`)
  return value
}

interface MailAttachment {
  filename?: string
  content: Buffer
}

export function selectSingleEdcCsvAttachment(attachments: MailAttachment[]): MailAttachment {
  const csvAttachments = attachments.filter(attachment => /\.csv$/i.test(attachment.filename || ''))
  if (csvAttachments.length !== 1) {
    throw new Error(`อีเมล LINE Pay EDC ต้องมีไฟล์ CSV เดียว แต่พบ ${csvAttachments.length} ไฟล์`)
  }
  return csvAttachments[0]
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
    const uids = await client.search({
      gmraw: `from:${REPORT_SENDER} subject:"รายงานสรุปยอดขาย EDC" newer_than:3d has:attachment`,
    }, { uid: true })
    for (const uid of (uids || []).slice(-20)) {
      const message = await client.fetchOne(uid, { source: true }, { uid: true })
      if (!message || !message.source) continue
      const parsed = await simpleParser(message.source)
      const senders = parsed.from?.value.map(item => item.address?.toLowerCase()).filter(Boolean) || []
      if (senders.length !== 1 || senders[0] !== REPORT_SENDER
        || !parsed.subject?.startsWith(REPORT_SUBJECT_PREFIX)) continue
      const messageId = parsed.messageId || `gmail-uid-${uid}`
      const attachment = selectSingleEdcCsvAttachment(parsed.attachments)
      found.push({ messageId, attachmentName: attachment.filename || 'edc-report.csv', content: attachment.content })
    }
  } finally {
    lock.release()
    await client.logout().catch(() => undefined)
  }
  return found
}

async function resolveEdcChannel(supabase: SupabaseClient): Promise<{ id: number; name: string }> {
  const { data: settings, error } = await supabase.rpc('get_settings')
  if (error) throw error
  const id = Number(settings?.default_edc_channel_id)
  const name = String(settings?.default_edc_channel_name || '')
  if (!id || !name) throw new Error('ยังไม่ได้ตั้งค่าช่องทางเครื่องรูดบัตร EDC')
  if (!name.includes(LINEPAY_EDC_POLICY.terminalId)) throw new Error(`ช่องทาง EDC ต้องเป็นเครื่อง ${LINEPAY_EDC_POLICY.terminalId}`)
  return { id, name }
}

async function resolveSettlementAccounts(): Promise<{
  bank: EdcAccount; fee: EdcAccount; pendingVat: EdcAccount; edcClearing: EdcAccount
}> {
  const chart = await getChartOfAccounts()
  const account = (code: string): EdcAccount => {
    const found = chart.find(item => item.code === code)
    if (!found) throw new Error(`ไม่พบบัญชี ${code} ใน FlowAccount`)
    return { chartOfAccountId: found.id, code: found.code, label: found.nameLocal }
  }
  const bank = account(LINEPAY_EDC_POLICY.accountCodes.bank)
  if (!bank.label.replace(/\D/g, '').includes(LINEPAY_EDC_POLICY.bankAccountNumber)) {
    throw new Error(`บัญชี ${LINEPAY_EDC_POLICY.accountCodes.bank} ต้องเป็น KBank ${LINEPAY_EDC_POLICY.bankAccountNumber}`)
  }
  const edcClearing = account(LINEPAY_EDC_POLICY.accountCodes.edcClearing)
  if (!edcClearing.label.includes(LINEPAY_EDC_POLICY.terminalId)) {
    throw new Error(`บัญชี ${LINEPAY_EDC_POLICY.accountCodes.edcClearing} ต้องเป็นเครื่อง EDC ${LINEPAY_EDC_POLICY.terminalId}`)
  }
  return {
    bank,
    fee: account(LINEPAY_EDC_POLICY.accountCodes.fee),
    pendingVat: account(LINEPAY_EDC_POLICY.accountCodes.pendingVat),
    edcClearing,
  }
}

async function ensureCashSaleVoided(recordId: number): Promise<void> {
  const response = await getCashInvoice(recordId)
  const document = response?.list?.[0] ?? response
  if (!isFlowAccountDocumentVoided(document)) await voidCashInvoice(recordId)
  const verifiedResponse = await getCashInvoice(recordId)
  const verified = verifiedResponse?.list?.[0] ?? verifiedResponse
  if (!isFlowAccountDocumentVoided(verified)) throw new Error(`Cash Sale ${recordId} ยังไม่เป็น Void หลังสั่ง cleanup`)
}

async function ensureJournalVoided(recordId: number): Promise<void> {
  try {
    await voidJournalEntry(recordId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('invalid status')) throw error
  }
  const response = await getJournalEntry(recordId)
  const document = response?.list?.[0] ?? response
  if (!isFlowAccountDocumentVoided(document)) throw new Error(`JV ${recordId} ยังไม่เป็น Void หลังสั่ง cleanup`)
}

async function syncCashSale(supabase: SupabaseClient, report: StoredEdcReport) {
  if (report.cash_sale_sync_state === 'cleanup_pending' && report.cash_sale_cleanup_record_id) {
    await ensureCashSaleVoided(report.cash_sale_cleanup_record_id)
    const { data: reset } = await supabase.from('linepay_edc_reports').update({
      cash_sale_sync_state: 'idle', cash_sale_cleanup_record_id: null, cash_sale_sync_error: null,
    }).eq('id', report.id).eq('cash_sale_sync_state', 'cleanup_pending').select('id').maybeSingle()
    if (!reset) throw new Error('Void Cash Sale EDC ค้างสำเร็จแต่ reset KINTSU ไม่สำเร็จ')
  } else if (report.cash_sale_record_id && report.cash_sale_document_serial) {
    return { recordId: report.cash_sale_record_id, documentSerial: report.cash_sale_document_serial, created: false }
  }
  const { data: claimed } = await supabase.from('linepay_edc_reports').update({
    cash_sale_sync_state: 'creating', cash_sale_sync_error: null,
  }).eq('id', report.id).is('cash_sale_record_id', null)
    .in('cash_sale_sync_state', ['idle','error']).select('id').maybeSingle()
  if (!claimed) throw new Error('Cash Sale EDC กำลังสร้างหรือสร้างแล้ว')
  try {
    const channel = await resolveEdcChannel(supabase)
    const created = await createCashInvoice(buildEdcCashSale({
      revenueDate: report.revenue_date, grossAmountSatang: report.gross_amount_satang,
      edcChannelId: channel.id, edcChannelName: channel.name,
    }))
    const { data: saved } = await supabase.from('linepay_edc_reports').update({
      cash_sale_record_id: created.recordId, cash_sale_document_serial: created.documentSerial,
      cash_sale_synced_at: new Date().toISOString(), cash_sale_sync_state: 'synced', cash_sale_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', report.id).eq('cash_sale_sync_state', 'creating')
      .is('cash_sale_record_id', null).select('id').maybeSingle()
    if (!saved) {
      try {
        await ensureCashSaleVoided(created.recordId)
      } catch (cleanupError) {
        await supabase.from('linepay_edc_reports').update({
          cash_sale_sync_state: 'cleanup_pending', cash_sale_cleanup_record_id: created.recordId,
          cash_sale_sync_error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        }).eq('id', report.id).eq('cash_sale_sync_state', 'creating')
        throw new Error(`มี Cash Sale EDC รอ Void: ${created.recordId}`)
      }
      throw new Error('สร้าง Cash Sale EDC แล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ และ Void แล้ว')
    }
    return { ...created, created: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('linepay_edc_reports').update({ cash_sale_sync_state: 'error', cash_sale_sync_error: message })
      .eq('id', report.id).eq('cash_sale_sync_state', 'creating')
    throw error
  }
}

async function syncSettlement(supabase: SupabaseClient, report: StoredEdcReport) {
  if (report.settlement_sync_state === 'cleanup_pending' && report.settlement_cleanup_record_id) {
    await ensureJournalVoided(report.settlement_cleanup_record_id)
    const { data: reset } = await supabase.from('linepay_edc_reports').update({
      settlement_sync_state: 'idle', settlement_cleanup_record_id: null, settlement_sync_error: null,
    }).eq('id', report.id).eq('settlement_sync_state', 'cleanup_pending').select('id').maybeSingle()
    if (!reset) throw new Error('Void JV Settlement EDC ค้างสำเร็จแต่ reset KINTSU ไม่สำเร็จ')
  } else if (report.settlement_record_id && report.settlement_document_serial) {
    return { recordId: report.settlement_record_id, documentSerial: report.settlement_document_serial, created: false }
  }
  const { data: claimed } = await supabase.from('linepay_edc_reports').update({
    settlement_sync_state: 'creating', settlement_sync_error: null,
  }).eq('id', report.id).is('settlement_record_id', null)
    .in('settlement_sync_state', ['idle','error']).select('id').maybeSingle()
  if (!claimed) throw new Error('JV Settlement EDC กำลังสร้างหรือสร้างแล้ว')
  try {
    const accounts = await resolveSettlementAccounts()
    const created = await createApprovedJournal(buildEdcSettlementJournal({
      settlementDate: report.settlement_date, grossAmountSatang: report.gross_amount_satang,
      feeAmountSatang: report.fee_amount_satang, feeVatSatang: report.fee_vat_satang,
      netAmountSatang: report.net_amount_satang, ...accounts,
    }))
    const { data: saved } = await supabase.from('linepay_edc_reports').update({
      settlement_record_id: created.recordId, settlement_document_serial: created.documentSerial,
      settlement_synced_at: new Date().toISOString(), settlement_sync_state: 'synced', settlement_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', report.id).eq('settlement_sync_state', 'creating')
      .is('settlement_record_id', null).select('id').maybeSingle()
    if (!saved) {
      try {
        await ensureJournalVoided(created.recordId)
      } catch (cleanupError) {
        await supabase.from('linepay_edc_reports').update({
          settlement_sync_state: 'cleanup_pending', settlement_cleanup_record_id: created.recordId,
          settlement_sync_error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        }).eq('id', report.id).eq('settlement_sync_state', 'creating')
        throw new Error(`มี JV Settlement EDC รอ Void: ${created.recordId}`)
      }
      throw new Error('สร้าง JV Settlement EDC แล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ และ Void แล้ว')
    }
    return { ...created, created: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('linepay_edc_reports').update({ settlement_sync_state: 'error', settlement_sync_error: message })
      .eq('id', report.id).eq('settlement_sync_state', 'creating')
    throw error
  }
}

export async function syncEdcReportToFlowAccount(supabase: SupabaseClient, reportId: string) {
  const { data: report, error } = await supabase.from('linepay_edc_reports').select('*')
    .eq('id', reportId).eq('is_deleted', false).single()
  if (error || !report) return { ok: false as const, error: error?.message || 'ไม่พบรายงาน EDC' }
  try {
    const storedReport = report as StoredEdcReport
    const cashSale = await syncCashSale(supabase, storedReport)
    const settlement = await syncSettlement(supabase, storedReport)
    return { ok: true as const, cashSale, settlement }
  } catch (syncError) {
    return { ok: false as const, error: syncError instanceof Error ? syncError.message : String(syncError) }
  }
}

async function importAttachment(supabase: SupabaseClient, input: { messageId: string; attachmentName: string; content: Buffer }) {
  const report = parseEdcDailyReport(input.content.toString('utf8'), input.attachmentName)
  if (!isExpectedEdcReport(report)) {
    return {
      imported: false, skipped: true, revenueDate: report.revenueDate,
      settlementDate: report.settlementDate, reason: 'ไม่ใช่รายงานรอบปัจจุบัน',
    }
  }
  const sha256 = createHash('sha256').update(input.content).digest('hex')
  const { data: existingByMessage } = await supabase.from('linepay_edc_reports').select('*')
    .eq('gmail_message_id', input.messageId).eq('is_deleted', false).maybeSingle()
  const { data: existingByHash } = existingByMessage ? { data: null } : await supabase.from('linepay_edc_reports').select('*')
    .eq('attachment_sha256', sha256).eq('is_deleted', false).maybeSingle()
  const existing = existingByMessage ?? existingByHash
  if (existing) {
    if (existing.revenue_date !== report.revenueDate || existing.settlement_date !== report.settlementDate
      || Number(existing.gross_amount_satang) !== report.grossAmountSatang
      || Number(existing.fee_amount_satang) !== report.feeAmountSatang
      || Number(existing.fee_vat_satang) !== report.feeVatSatang
      || Number(existing.net_amount_satang) !== report.netAmountSatang) {
      throw new Error('รายงาน EDC เดิมใน KINTSU ไม่ตรงกับไฟล์ LINE Pay')
    }
    const { error: repairError } = await supabase.from('daily_sales').upsert({
      id: existing.revenue_date, date: existing.revenue_date,
      linepay_edc_gross_satang: existing.gross_amount_satang,
      linepay_edc_report_id: existing.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (repairError) throw repairError
    return {
      imported: false, reportId: existing.id, revenueDate: existing.revenue_date,
      settlementDate: existing.settlement_date, grossAmountSatang: existing.gross_amount_satang,
    }
  }
  const { data: inserted, error } = await supabase.from('linepay_edc_reports').insert({
    revenue_date: report.revenueDate, settlement_date: report.settlementDate,
    gmail_message_id: input.messageId, attachment_sha256: sha256, attachment_name: input.attachmentName,
    merchant_id: report.merchantId, merchant_name: report.merchantName, terminal_id: report.terminalId,
    transaction_count: report.transactionCount, gross_amount_satang: report.grossAmountSatang,
    fee_amount_satang: report.feeAmountSatang, fee_vat_satang: report.feeVatSatang,
    net_amount_satang: report.netAmountSatang,
  }).select('id').single()
  if (error || !inserted) throw error || new Error('บันทึกรายงาน EDC ไม่สำเร็จ')
  const rows = report.transactions.map(transaction => ({
    report_id: inserted.id, transaction_id: transaction.transactionId,
    transaction_time: `${transaction.transactionTime}+07:00`, service_name: transaction.serviceName,
    amount_satang: transaction.amountSatang, fee_rate: transaction.feeRate,
    fee_amount_satang: transaction.feeAmountSatang, fee_vat_satang: transaction.feeVatSatang,
    net_amount_satang: transaction.netAmountSatang,
  }))
  const { error: transactionError } = await supabase.from('linepay_edc_transactions').insert(rows)
  if (transactionError) {
    const deletedAt = new Date().toISOString()
    await supabase.from('linepay_edc_reports').update({ is_deleted: true, deleted_at: deletedAt }).eq('id', inserted.id)
    throw transactionError
  }
  const { error: salesError } = await supabase.from('daily_sales').upsert({
    id: report.revenueDate, date: report.revenueDate, linepay_edc_gross_satang: report.grossAmountSatang,
    linepay_edc_report_id: inserted.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (salesError) {
    const deletedAt = new Date().toISOString()
    await supabase.from('linepay_edc_transactions').update({ is_deleted: true, deleted_at: deletedAt })
      .eq('report_id', inserted.id).eq('is_deleted', false)
    await supabase.from('linepay_edc_reports').update({ is_deleted: true, deleted_at: deletedAt }).eq('id', inserted.id)
    throw salesError
  }
  return {
    imported: true, reportId: inserted.id, revenueDate: report.revenueDate,
    settlementDate: report.settlementDate, grossAmountSatang: report.grossAmountSatang,
  }
}

export async function importLinePayEdcFromGmail(supabase: SupabaseClient) {
  const messages = await findReportMessages()
  const results = []
  for (const message of messages) {
    const imported = await importAttachment(supabase, message)
    if ('skipped' in imported && imported.skipped) {
      results.push(imported)
      continue
    }
    const sync = await syncEdcReportToFlowAccount(supabase, imported.reportId)
    results.push({ ...imported, sync })
  }
  const expected = expectedEdcDates()
  const current = results.find(result => !('skipped' in result && result.skipped)
    && result.revenueDate === expected.revenueDate
    && result.settlementDate === expected.settlementDate)
  if (!current) throw new Error(`ไม่พบรายงาน LINE Pay EDC ของวันขาย ${expected.revenueDate}`)
  if (!('sync' in current) || !current.sync.ok) {
    throw new Error('sync' in current ? current.sync.error : 'รายงาน EDC รอบปัจจุบันยังไม่ได้ Sync')
  }
  return { scanned: messages.length, results, current }
}
