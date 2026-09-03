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
  settlement_record_id: number | null
  settlement_document_serial: string | null
  settlement_sync_state: 'idle' | 'creating' | 'synced' | 'cleanup_pending' | 'error'
  settlement_cleanup_record_id: number | null
}

interface StoredEdcRevenueDay {
  id: string
  revenue_date: string
  gross_amount_satang: number
  full_tax_invoice_satang?: number | null
  cash_sale_record_id: number | null
  cash_sale_document_serial: string | null
  cash_sale_synced_amount_satang: number | null
  cash_sale_sync_state: 'idle' | 'creating' | 'synced' | 'replacing' | 'cleanup_pending' | 'error'
  cash_sale_cleanup_record_id: number | null
}

export function expectedEdcDates(now = Date.now()): { revenueDate: string; settlementDate: string } {
  const format = (value: number) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
  return { settlementDate: format(now), revenueDate: format(now - 86_400_000) }
}

export function isExpectedEdcReport(
  report: { revenueDate: string; revenueDays?: Array<{ revenueDate: string }>; settlementDate: string },
  expected = expectedEdcDates(),
): boolean {
  const revenueDates = report.revenueDays?.map(day => day.revenueDate) ?? [report.revenueDate]
  return revenueDates.includes(expected.revenueDate) && report.settlementDate === expected.settlementDate
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า ${name}`)
  return value
}

// Supabase/Postgrest errors (e.g. a unique-constraint violation) are plain objects with a
// `.message` string, not `Error` instances — `error instanceof Error ? error.message :
// String(error)` (used throughout this pipeline) turns those into the literal text
// "[object Object]" instead of the real message. These two helpers keep a readable message
// through every catch/throw in this file so that pattern always works as intended.
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return String(error)
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(messageOf(error))
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
  if (error) throw toError(error)
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
    const message = messageOf(error)
    if (!message.includes('invalid status')) throw toError(error)
  }
  const response = await getJournalEntry(recordId)
  const document = response?.list?.[0] ?? response
  if (!isFlowAccountDocumentVoided(document)) throw new Error(`JV ${recordId} ยังไม่เป็น Void หลังสั่ง cleanup`)
}

async function syncCashSale(supabase: SupabaseClient, revenueDay: StoredEdcRevenueDay) {
  let current = revenueDay
  const targetGrossSatang = current.gross_amount_satang - Number(current.full_tax_invoice_satang || 0)
  if (targetGrossSatang < 0) throw new Error(`ยอดใบกำกับภาษีเต็มรูปเกินยอด EDC วันที่ ${current.revenue_date}`)
  if ((current.cash_sale_sync_state === 'replacing' || current.cash_sale_sync_state === 'cleanup_pending')
    && current.cash_sale_cleanup_record_id) {
    await ensureCashSaleVoided(current.cash_sale_cleanup_record_id)
    const { data: reset } = await supabase.from('linepay_edc_revenue_days').update({
      cash_sale_record_id: null, cash_sale_document_serial: null, cash_sale_synced_amount_satang: null,
      cash_sale_synced_at: null, cash_sale_sync_state: 'idle', cash_sale_cleanup_record_id: null,
      cash_sale_sync_error: null, updated_at: new Date().toISOString(),
    }).eq('id', current.id).in('cash_sale_sync_state', ['replacing','cleanup_pending'])
      .select('*').maybeSingle()
    if (!reset) throw new Error('Void Cash Sale EDC ค้างสำเร็จแต่ reset KINTSU ไม่สำเร็จ')
    current = reset as StoredEdcRevenueDay
  } else if (current.cash_sale_record_id && current.cash_sale_document_serial
    && current.cash_sale_synced_amount_satang === targetGrossSatang) {
    return { revenueDate: current.revenue_date, recordId: current.cash_sale_record_id, documentSerial: current.cash_sale_document_serial, created: false }
  } else if (current.cash_sale_record_id || current.cash_sale_document_serial) {
    throw new Error(`Cash Sale EDC วันที่ ${current.revenue_date} มียอดหรือ state ไม่ตรง ต้องตรวจ FlowAccount`)
  }
  if (targetGrossSatang === 0) {
    return { revenueDate: current.revenue_date, skipped: true, reason: 'ยอด EDC ทั้งวันออกใบกำกับภาษีเต็มรูปแล้ว' }
  }
  const { data: claimed } = await supabase.from('linepay_edc_revenue_days').update({
    cash_sale_sync_state: 'creating', cash_sale_sync_error: null,
  }).eq('id', current.id).is('cash_sale_record_id', null)
    .in('cash_sale_sync_state', ['idle','error']).select('id').maybeSingle()
  if (!claimed) throw new Error('Cash Sale EDC กำลังสร้างหรือสร้างแล้ว')
  try {
    const channel = await resolveEdcChannel(supabase)
    const created = await createCashInvoice(buildEdcCashSale({
      revenueDate: current.revenue_date, grossAmountSatang: targetGrossSatang,
      edcChannelId: channel.id, edcChannelName: channel.name,
    }))
    const { data: saved } = await supabase.from('linepay_edc_revenue_days').update({
      cash_sale_record_id: created.recordId, cash_sale_document_serial: created.documentSerial,
      cash_sale_synced_amount_satang: targetGrossSatang,
      cash_sale_synced_at: new Date().toISOString(), cash_sale_sync_state: 'synced', cash_sale_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', current.id).eq('cash_sale_sync_state', 'creating')
      .is('cash_sale_record_id', null).select('id').maybeSingle()
    if (!saved) {
      try {
        await ensureCashSaleVoided(created.recordId)
      } catch (cleanupError) {
        await supabase.from('linepay_edc_revenue_days').update({
          cash_sale_sync_state: 'cleanup_pending', cash_sale_cleanup_record_id: created.recordId,
          cash_sale_sync_error: messageOf(cleanupError),
        }).eq('id', current.id).eq('cash_sale_sync_state', 'creating')
        throw new Error(`มี Cash Sale EDC รอ Void: ${created.recordId}`)
      }
      throw new Error('สร้าง Cash Sale EDC แล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ และ Void แล้ว')
    }
    return { revenueDate: current.revenue_date, ...created, created: true }
  } catch (error) {
    const message = messageOf(error)
    await supabase.from('linepay_edc_revenue_days').update({ cash_sale_sync_state: 'error', cash_sale_sync_error: message })
      .eq('id', current.id).eq('cash_sale_sync_state', 'creating')
    throw toError(error)
  }
}

export async function replaceEdcCashSaleForTaxInvoice(
  supabase: SupabaseClient,
  revenueDay: StoredEdcRevenueDay,
) {
  const targetGrossSatang = revenueDay.gross_amount_satang - Number(revenueDay.full_tax_invoice_satang || 0)
  if (revenueDay.cash_sale_record_id && revenueDay.cash_sale_document_serial
    && revenueDay.cash_sale_synced_amount_satang === targetGrossSatang
    && revenueDay.cash_sale_sync_state === 'synced') {
    return {
      revenueDate: revenueDay.revenue_date, recordId: revenueDay.cash_sale_record_id,
      documentSerial: revenueDay.cash_sale_document_serial, created: false,
    }
  }
  if (revenueDay.cash_sale_sync_state === 'replacing' || revenueDay.cash_sale_sync_state === 'cleanup_pending') {
    return syncCashSale(supabase, revenueDay)
  }
  if (!revenueDay.cash_sale_record_id) return syncCashSale(supabase, revenueDay)
  const { data: claimed, error } = await supabase.from('linepay_edc_revenue_days').update({
    cash_sale_sync_state: 'replacing',
    cash_sale_cleanup_record_id: revenueDay.cash_sale_record_id,
    cash_sale_sync_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', revenueDay.id).eq('cash_sale_sync_state', 'synced')
    .eq('cash_sale_record_id', revenueDay.cash_sale_record_id).select('*').maybeSingle()
  if (error || !claimed) {
    throw error ? toError(error) : new Error(`Cash Sale EDC วันที่ ${revenueDay.revenue_date} ถูกแก้ไขพร้อมกัน`)
  }
  return syncCashSale(supabase, claimed as StoredEdcRevenueDay)
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
          settlement_sync_error: messageOf(cleanupError),
        }).eq('id', report.id).eq('settlement_sync_state', 'creating')
        throw new Error(`มี JV Settlement EDC รอ Void: ${created.recordId}`)
      }
      throw new Error('สร้าง JV Settlement EDC แล้วแต่บันทึกกลับ KINTSU ไม่สำเร็จ และ Void แล้ว')
    }
    return { ...created, created: true }
  } catch (error) {
    const message = messageOf(error)
    await supabase.from('linepay_edc_reports').update({ settlement_sync_state: 'error', settlement_sync_error: message })
      .eq('id', report.id).eq('settlement_sync_state', 'creating')
    throw toError(error)
  }
}

export async function syncEdcReportToFlowAccount(supabase: SupabaseClient, reportId: string) {
  const { data: report, error } = await supabase.from('linepay_edc_reports').select('*')
    .eq('id', reportId).eq('is_deleted', false).single()
  if (error || !report) return { ok: false as const, error: error?.message || 'ไม่พบรายงาน EDC' }
  try {
    const storedReport = report as StoredEdcReport
    const { data: contributions, error: contributionsError } = await supabase.from('linepay_edc_report_revenue_days')
      .select('revenue_day_id').eq('report_id', reportId).eq('is_deleted', false)
    if (contributionsError || !contributions?.length) {
      throw contributionsError ? toError(contributionsError) : new Error('ไม่พบวันขายในรายงาน EDC')
    }
    const { data: revenueDays, error: revenueDaysError } = await supabase.from('linepay_edc_revenue_days')
      .select('*').in('id', contributions.map(item => item.revenue_day_id))
      .eq('is_deleted', false).order('revenue_date')
    if (revenueDaysError || !revenueDays?.length) throw revenueDaysError ? toError(revenueDaysError) : new Error('ไม่พบยอดรวมวันขาย EDC')
    const cashSales = []
    for (const revenueDay of revenueDays as StoredEdcRevenueDay[]) {
      cashSales.push(await syncCashSale(supabase, revenueDay))
    }
    const settlement = await syncSettlement(supabase, storedReport)
    return { ok: true as const, cashSales, settlement }
  } catch (syncError) {
    return { ok: false as const, error: messageOf(syncError) }
  }
}

export async function importLinePayEdcAttachment(
  supabase: SupabaseClient,
  input: { messageId: string; attachmentName: string; content: Buffer },
  options: { enforceExpected?: boolean } = {},
) {
  const report = parseEdcDailyReport(input.content.toString('utf8'))
  if (options.enforceExpected !== false && !isExpectedEdcReport(report)) {
    return {
      imported: false, skipped: true, revenueDate: report.revenueDate,
      revenueDates: report.revenueDays.map(day => day.revenueDate),
      settlementDate: report.settlementDate, reason: 'ไม่ใช่รายงานรอบปัจจุบัน',
    }
  }
  const sha256 = createHash('sha256').update(input.content).digest('hex')
  const { data: existingByMessage } = await supabase.from('linepay_edc_reports').select('*')
    .eq('gmail_message_id', input.messageId).eq('is_deleted', false).maybeSingle()
  const { data: existingByHash } = existingByMessage ? { data: null } : await supabase.from('linepay_edc_reports').select('*')
    .eq('attachment_sha256', sha256).eq('is_deleted', false).maybeSingle()
  // LINE Pay has resent a corrected file for a settlement already imported under a
  // different email/attachment (e.g. a same-settlement-date transaction_time correction) —
  // settlement_date is uniquely constrained per active report, so it's the authoritative
  // match even when the message ID and file hash both differ. Falling through to the insert
  // below in that case hits the DB unique-constraint violation instead of this function's
  // own "does it actually match" comparison further down.
  const { data: existingBySettlement } = (existingByMessage || existingByHash) ? { data: null } : await supabase.from('linepay_edc_reports').select('*')
    .eq('settlement_date', report.settlementDate).eq('is_deleted', false).maybeSingle()
  const existing = existingByMessage ?? existingByHash ?? existingBySettlement
  if (existing) {
    if (existing.revenue_date !== report.revenueDate || existing.settlement_date !== report.settlementDate
      || Number(existing.gross_amount_satang) !== report.grossAmountSatang
      || Number(existing.fee_amount_satang) !== report.feeAmountSatang
      || Number(existing.fee_vat_satang) !== report.feeVatSatang
      || Number(existing.net_amount_satang) !== report.netAmountSatang) {
      throw new Error('รายงาน EDC เดิมใน KINTSU ไม่ตรงกับไฟล์ LINE Pay')
    }
    const { data: storedDays, error: storedDaysError } = await supabase.from('linepay_edc_report_revenue_days')
      .select('revenue_date,gross_amount_satang,fee_amount_satang,fee_vat_satang,net_amount_satang')
      .eq('report_id', existing.id).eq('is_deleted', false).order('revenue_date')
    if (storedDaysError || !storedDays) throw storedDaysError ? toError(storedDaysError) : new Error('ไม่พบวันขายในรายงาน EDC เดิม')
    const storedShape = storedDays.map(day => [
      day.revenue_date, Number(day.gross_amount_satang), Number(day.fee_amount_satang),
      Number(day.fee_vat_satang), Number(day.net_amount_satang),
    ])
    const parsedShape = report.revenueDays.map(day => [
      day.revenueDate, day.grossAmountSatang, day.feeAmountSatang, day.feeVatSatang, day.netAmountSatang,
    ])
    if (JSON.stringify(storedShape) !== JSON.stringify(parsedShape)) {
      throw new Error('วันขายในรายงาน EDC เดิมไม่ตรงกับไฟล์ LINE Pay')
    }
    return {
      imported: false, reportId: existing.id, revenueDate: existing.revenue_date,
      revenueDates: report.revenueDays.map(day => day.revenueDate),
      settlementDate: existing.settlement_date, grossAmountSatang: existing.gross_amount_satang,
    }
  }
  const { data: insertedId, error } = await supabase.rpc('import_linepay_edc_report', {
    p_report: {
      revenue_date: report.revenueDate, settlement_date: report.settlementDate,
      gmail_message_id: input.messageId, attachment_sha256: sha256, attachment_name: input.attachmentName,
      merchant_id: report.merchantId, merchant_name: report.merchantName, terminal_id: report.terminalId,
      transaction_count: report.transactionCount, gross_amount_satang: report.grossAmountSatang,
      fee_amount_satang: report.feeAmountSatang, fee_vat_satang: report.feeVatSatang,
      net_amount_satang: report.netAmountSatang,
    },
    p_revenue_days: report.revenueDays.map(day => ({
      revenue_date: day.revenueDate, transaction_count: day.transactionCount,
      gross_amount_satang: day.grossAmountSatang, fee_amount_satang: day.feeAmountSatang,
      fee_vat_satang: day.feeVatSatang, net_amount_satang: day.netAmountSatang,
    })),
    p_transactions: report.transactions.map(transaction => ({
      transaction_id: transaction.transactionId, transaction_time: `${transaction.transactionTime}+07:00`,
      service_name: transaction.serviceName, amount_satang: transaction.amountSatang,
      fee_rate: transaction.feeRate, fee_amount_satang: transaction.feeAmountSatang,
      fee_vat_satang: transaction.feeVatSatang, net_amount_satang: transaction.netAmountSatang,
    })),
  })
  if (error || !insertedId) throw error ? toError(error) : new Error('บันทึกรายงาน EDC ไม่สำเร็จ')
  return {
    imported: true, reportId: String(insertedId), revenueDate: report.revenueDate,
    revenueDates: report.revenueDays.map(day => day.revenueDate),
    settlementDate: report.settlementDate, grossAmountSatang: report.grossAmountSatang,
  }
}

// Finishes any 'pending_edc_report' full tax invoices for this revenue date now
// that the settlement report has arrived. Must run before syncEdcReportToFlowAccount
// so the day's Cash Sale is created net of what these invoices already carved out.
export async function reconcilePendingEdcTaxInvoices(supabase: SupabaseClient, revenueDate: string) {
  const { data, error } = await supabase.rpc('reconcile_pending_edc_tax_invoices', { p_revenue_date: revenueDate })
  if (error) throw toError(error)
  return data as { completed_ids: string[]; manual_review_ids: string[] }
}

export async function importLinePayEdcFromGmail(supabase: SupabaseClient) {
  const messages = await findReportMessages()
  const results = []
  for (const message of messages) {
    const imported = await importLinePayEdcAttachment(supabase, message)
    if ('skipped' in imported && imported.skipped) {
      results.push(imported)
      continue
    }
    const reconciliations = []
    for (const revenueDate of imported.revenueDates) {
      reconciliations.push(await reconcilePendingEdcTaxInvoices(supabase, revenueDate))
    }
    const sync = await syncEdcReportToFlowAccount(supabase, imported.reportId)
    results.push({ ...imported, sync, manualReviewTaxInvoiceIds: reconciliations.flatMap(item => item.manual_review_ids) })
  }
  const expected = expectedEdcDates()
  const current = results.find(result => !('skipped' in result && result.skipped)
    && result.revenueDates.includes(expected.revenueDate)
    && result.settlementDate === expected.settlementDate)
  if (!current) throw new Error(`ไม่พบรายงาน LINE Pay EDC ของวันขาย ${expected.revenueDate}`)
  if (!('sync' in current) || !current.sync.ok) {
    throw new Error('sync' in current ? current.sync.error : 'รายงาน EDC รอบปัจจุบันยังไม่ได้ Sync')
  }
  return { scanned: messages.length, results, current }
}
