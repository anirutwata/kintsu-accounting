import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exportTaxInvoicePdfBase64, attachTaxInvoiceFiles } from '@/lib/flowaccount'
import { sendTaxInvoiceEmail } from '@/lib/email'
import { sendTelegram, editTelegramCaption, answerCallbackQuery, escapeHtml, buildTaxInvoiceRequestDetails } from '@/lib/telegram'
import { getTodayBKK } from '@/lib/utils'
import { processApprovedTaxInvoice } from '@/lib/taxInvoiceApprovalService'

// Telegram calls this route directly from the internet — verify the shared secret
// set via setWebhook's secret_token so random POSTs can't trigger real approvals.
function isAuthentic(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return false
  return req.headers.get('x-telegram-bot-api-secret-token') === expected
}

function approverName(from: { first_name?: string; last_name?: string; username?: string }) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ')
  return name || from.username || 'ไม่ทราบชื่อ'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function POST(req: Request) {
  if (!isAuthentic(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const update = await req.json()
  const cb = update.callback_query
  if (!cb || typeof cb.data !== 'string') return NextResponse.json({ ok: true })

  const [prefix, action, requestId] = cb.data.split(':')
  if (prefix !== 'tir' || !['approve', 'reject'].includes(action) || !requestId) {
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()
  const approver = approverName(cb.from)
  const messageId: number | undefined = cb.message?.message_id

  // Atomic claim — only one of possibly-simultaneous button presses wins.
  const { data: claimed, error: claimError } = await supabase
    .from('tax_invoice_requests')
    .update({ status: 'processing', reviewed_by: approver, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending_review')
    .select()
    .single()

  if (claimError || !claimed) {
    await answerCallbackQuery(cb.id, 'คำขอนี้ถูกดำเนินการไปแล้ว')
    return NextResponse.json({ ok: true })
  }

  const safeName = escapeHtml(claimed.contact_name)

  if (action === 'reject') {
    if (claimed.dedup_state && claimed.dedup_state !== 'unreserved') {
      await supabase.from('tax_invoice_requests').update({
        status: 'accounting_review',
        error_message: 'คำขอนี้เริ่มสร้างเอกสาร/จองยอดแล้ว ต้องให้ผู้ทำบัญชีตรวจสอบ ห้ามยกเลิกอัตโนมัติ',
      }).eq('id', requestId)
      await answerCallbackQuery(cb.id, 'รายการเริ่มลงบัญชีแล้ว ต้องตรวจสอบก่อน')
      if (messageId) {
        await editTelegramCaption(
          messageId,
          `⏸️ <b>ยกเลิกอัตโนมัติไม่ได้</b>\n\n${buildTaxInvoiceRequestDetails(claimed)}\n\nรายการเริ่มสร้างเอกสารหรือจองยอดแล้ว กรุณาให้ผู้ทำบัญชีตรวจสอบ`,
        )
      }
      return NextResponse.json({ ok: true, manualReview: true })
    }
    await supabase.from('tax_invoice_requests').update({ status: 'rejected' }).eq('id', requestId)
    await answerCallbackQuery(cb.id, 'ปฏิเสธคำขอแล้ว')
    if (messageId) {
      await editTelegramCaption(
        messageId,
        `❌ <b>ปฏิเสธคำขอ</b>\n👤 ${safeName}\nโดย ${escapeHtml(approver)}`,
      )
    }
    return NextResponse.json({ ok: true })
  }

  // action === 'approve'
  await answerCallbackQuery(cb.id, 'กำลังออกใบกำกับภาษี...')

  const documentDate = claimed.document_date || getTodayBKK()

  try {
    const accounting = await processApprovedTaxInvoice(supabase, requestId, getTodayBKK())
    if (!accounting.ok) {
      await supabase.from('tax_invoice_requests').update({
        status: 'accounting_review',
        error_message: 'รอบภาษีหรือเอกสารย้อนหลังต้องให้ผู้ทำบัญชีตรวจสอบก่อน',
      }).eq('id', requestId)
      if (messageId) {
        await editTelegramCaption(
          messageId,
          `⏸️ <b>รอตรวจสอบบัญชี/ภาษี</b>\n\n${buildTaxInvoiceRequestDetails(claimed)}\n\nยังไม่ได้สร้างใบกำกับภาษีใน FlowAccount`,
        )
      }
      return NextResponse.json({ ok: true, manualReview: true })
    }
    const invoice = accounting.invoice

    if (claimed.bill_image_url) {
      try {
        await attachTaxInvoiceFiles(invoice.recordId, [claimed.bill_image_url])
      } catch (attachErr: unknown) {
        // Document already created — a failed attachment shouldn't fail the whole
        // approval, just tell staff so they can attach it manually if it matters.
        await sendTelegram(
          `⚠️ ออก ${invoice.documentSerial} สำเร็จ แต่แนบรูปบิลของลูกค้าไม่สำเร็จ: ${errorMessage(attachErr)}`,
          'taxInvoice',
        )
      }
    }

    try {
      const pdfBase64 = await exportTaxInvoicePdfBase64(invoice.recordId)
      await sendTaxInvoiceEmail({ to: claimed.contact_email, documentSerial: invoice.documentSerial, documentDate, pdfBase64 })
      await supabase
        .from('tax_invoice_requests')
        .update({ status: 'emailed', emailed_at: new Date().toISOString() })
        .eq('id', requestId)

      const pendingNote = accounting.pendingReconciliation
        ? '\n\n⏳ ยังไม่มีรายงาน LINE Pay EDC ของวันนี้ ระบบจะปรับยอดกันรายได้ซ้ำอัตโนมัติพรุ่งนี้'
        : ''
      if (messageId) {
        await editTelegramCaption(
          messageId,
          `✅ <b>อนุมัติแล้ว</b>\n👤 ${safeName}\n📄 ${invoice.documentSerial}\nโดย ${escapeHtml(approver)}${pendingNote}`,
        )
      }
      await sendTelegram(`📧 ส่งอีเมลใบกำกับภาษี ${invoice.documentSerial} ให้ลูกค้าแล้ว (${escapeHtml(claimed.contact_email)})`, 'taxInvoice')
    } catch (emailErr: unknown) {
      await supabase
        .from('tax_invoice_requests')
        .update({ error_message: `email failed: ${errorMessage(emailErr)}` })
        .eq('id', requestId)
      if (messageId) {
        await editTelegramCaption(
          messageId,
          `⚠️ <b>อนุมัติแล้ว แต่ส่งอีเมลไม่สำเร็จ</b>\n👤 ${safeName}\n📄 ${invoice.documentSerial}\nโดย ${escapeHtml(approver)}\n\nรบกวนส่ง PDF ให้ลูกค้าด้วยตนเอง (${escapeHtml(claimed.contact_email)})`,
        )
      }
    }
  } catch (err: unknown) {
    const message = errorMessage(err)
    await supabase
      .from('tax_invoice_requests')
      .update({
        status: 'pending_review',
        error_message: message,
        dedup_error: message,
        dedup_state_changed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    if (messageId) {
      await editTelegramCaption(
        messageId,
        `❌ <b>ออกใบกำกับภาษี/ปรับรายได้ยังไม่สำเร็จ</b>\nโดย ${escapeHtml(approver)}\n\n${buildTaxInvoiceRequestDetails(claimed)}\n\nError: ${escapeHtml(message)}\n\nตรวจ FlowAccount ก่อนลองใหม่`,
        [[{ text: '🔄 ลองอีกครั้ง', callback_data: `tir:approve:${requestId}` }]],
      )
    }
  }

  return NextResponse.json({ ok: true })
}
