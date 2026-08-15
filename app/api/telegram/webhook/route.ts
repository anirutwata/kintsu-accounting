import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createTaxInvoice, exportTaxInvoicePdfBase64, resolveTaxInvoicePayment } from '@/lib/flowaccount'
import { sendTaxInvoiceEmail } from '@/lib/email'
import { sendTelegram, editTelegramCaption, answerCallbackQuery, escapeHtml } from '@/lib/telegram'
import { getTodayBKK } from '@/lib/utils'

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

export async function POST(req: Request) {
  if (!isAuthentic(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const update = await req.json()
  const cb = update.callback_query
  if (!cb || typeof cb.data !== 'string') return NextResponse.json({ ok: true })

  const [prefix, action, requestId] = cb.data.split(':')
  if (prefix !== 'tir' || !['approve', 'reject'].includes(action) || !requestId) {
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()
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

  const today = getTodayBKK()
  const totalBaht = claimed.total_satang / 100
  const subTotal = Math.round((totalBaht / 1.07) * 100) / 100
  const vatAmount = Math.round(subTotal * 0.07 * 100) / 100
  const roundingAmount = Math.max(0, Math.round((subTotal + vatAmount - totalBaht) * 100) / 100)

  try {
    const invoice = await createTaxInvoice({
      contactName: claimed.contact_name,
      contactTaxId: claimed.contact_tax_id || undefined,
      contactAddress: claimed.contact_address || undefined,
      contactBranch: claimed.contact_branch || undefined,
      publishedOn: today,
      remarks: claimed.description,
      items: [{ name: claimed.description, quantity: 1, unitName: 'รายการ', pricePerUnit: subTotal }],
      payment: resolveTaxInvoicePayment(claimed.payment_method, today, roundingAmount),
    })

    await supabase
      .from('tax_invoice_requests')
      .update({ status: 'created', flowaccount_record_id: invoice.recordId, flowaccount_document_serial: invoice.documentSerial })
      .eq('id', requestId)

    try {
      const pdfBase64 = await exportTaxInvoicePdfBase64(invoice.recordId)
      await sendTaxInvoiceEmail({ to: claimed.contact_email, documentSerial: invoice.documentSerial, documentDate: today, pdfBase64 })
      await supabase
        .from('tax_invoice_requests')
        .update({ status: 'emailed', emailed_at: new Date().toISOString() })
        .eq('id', requestId)

      if (messageId) {
        await editTelegramCaption(
          messageId,
          `✅ <b>อนุมัติแล้ว</b>\n👤 ${safeName}\n📄 ${invoice.documentSerial}\nโดย ${escapeHtml(approver)}`,
        )
      }
      sendTelegram(`📧 ส่งอีเมลใบกำกับภาษี ${invoice.documentSerial} ให้ลูกค้าแล้ว (${escapeHtml(claimed.contact_email)})`, 'taxInvoice')
    } catch (emailErr: any) {
      await supabase
        .from('tax_invoice_requests')
        .update({ error_message: `email failed: ${emailErr.message}` })
        .eq('id', requestId)
      if (messageId) {
        await editTelegramCaption(
          messageId,
          `⚠️ <b>อนุมัติแล้ว แต่ส่งอีเมลไม่สำเร็จ</b>\n👤 ${safeName}\n📄 ${invoice.documentSerial}\nโดย ${escapeHtml(approver)}\n\nรบกวนส่ง PDF ให้ลูกค้าด้วยตนเอง (${escapeHtml(claimed.contact_email)})`,
        )
      }
    }
  } catch (err: any) {
    await supabase
      .from('tax_invoice_requests')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', requestId)
    if (messageId) {
      await editTelegramCaption(
        messageId,
        `❌ <b>ออกใบกำกับภาษีไม่สำเร็จ</b>\n👤 ${safeName}\nโดย ${escapeHtml(approver)}\n\nError: ${escapeHtml(err.message)}`,
      )
    }
  }

  return NextResponse.json({ ok: true })
}
