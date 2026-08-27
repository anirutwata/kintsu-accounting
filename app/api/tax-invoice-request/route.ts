import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramPhoto, sendTelegram, escapeHtml, buildTaxInvoiceRequestDetails } from '@/lib/telegram'
import { getTodayBKK } from '@/lib/utils'
import {
  DUPLICATE_TAX_INVOICE_REQUEST_MESSAGE,
  isDuplicateTaxInvoiceRequest,
} from '@/lib/taxInvoiceRequestDuplicate'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAYMENT_METHODS = ['cash', 'transfer', 'credit_card'] as const
const CONTACT_GROUPS = ['individual', 'juristic'] as const
// Fixed line-item description — not customer-editable, so every invoice reads the same way.
const FIXED_DESCRIPTION = 'ค่าอาหาร และเครื่องดื่ม'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: Request) {
  const body = await req.json()
  const documentDate = String(body.document_date || '')
  const contactGroup = CONTACT_GROUPS.includes(body.contact_group) ? body.contact_group : null
  const contactName = String(body.contact_name || '').trim()
  const contactTaxId = String(body.contact_tax_id || '').replace(/[^0-9]/g, '')
  const contactAddress = String(body.contact_address || '').trim()
  const contactBranch = String(body.contact_branch || '').trim()
  const contactEmail = String(body.contact_email || '').trim()
  const description = FIXED_DESCRIPTION
  const subtotalBaht = Number(body.subtotal_baht)
  const totalBaht = Number(body.total_baht)
  const paymentMethod = PAYMENT_METHODS.includes(body.payment_method) ? body.payment_method : null
  const billImageUrl = String(body.bill_image_url || '').trim()

  if (!DATE_RE.test(documentDate)) return NextResponse.json({ error: 'กรุณาระบุวันที่ในบิล/ใบเสร็จให้ถูกต้อง' }, { status: 400 })
  if (documentDate > getTodayBKK()) return NextResponse.json({ error: 'วันที่ในบิลต้องไม่เป็นวันที่ในอนาคต' }, { status: 400 })
  if (!contactGroup) return NextResponse.json({ error: 'กรุณาเลือกประเภทผู้เสียภาษี' }, { status: 400 })
  if (!contactName) return NextResponse.json({ error: 'กรุณากรอกชื่อลูกค้า/บริษัท' }, { status: 400 })
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) return NextResponse.json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' }, { status: 400 })
  if (contactGroup === 'juristic' && !contactTaxId) return NextResponse.json({ error: 'นิติบุคคลต้องระบุเลขผู้เสียภาษี 13 หลัก' }, { status: 400 })
  if (contactTaxId && contactTaxId.length !== 13) return NextResponse.json({ error: 'เลขผู้เสียภาษีต้องมี 13 หลัก' }, { status: 400 })
  if (!subtotalBaht || subtotalBaht <= 0) return NextResponse.json({ error: 'กรุณากรอกยอดก่อน VAT ให้ถูกต้อง' }, { status: 400 })
  if (!totalBaht || totalBaht <= 0) return NextResponse.json({ error: 'กรุณากรอกยอดเงินให้ถูกต้อง' }, { status: 400 })
  if (totalBaht < subtotalBaht) return NextResponse.json({ error: 'ยอดรวมต้องไม่น้อยกว่ายอดก่อน VAT' }, { status: 400 })
  // Catches a plain typo in one of the two amount fields before it ever reaches a human
  // reviewer — VAT_TOLERANCE_BAHT covers normal ปัดเศษ (rounding to the nearest baht),
  // not a genuinely mismatched pair of numbers.
  const expectedTotal = Math.round(subtotalBaht * 1.07 * 100) / 100
  const VAT_TOLERANCE_BAHT = 3
  if (Math.abs(totalBaht - expectedTotal) > VAT_TOLERANCE_BAHT) {
    return NextResponse.json({ error: `ยอดก่อน VAT กับยอดรวมไม่สัมพันธ์กัน (คาดว่ายอดรวมควรอยู่ที่ประมาณ ${expectedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท) กรุณาตรวจสอบตัวเลขจากบิลอีกครั้ง` }, { status: 400 })
  }
  if (!paymentMethod) return NextResponse.json({ error: 'กรุณาเลือกช่องทางชำระเงิน' }, { status: 400 })
  if (!billImageUrl) return NextResponse.json({ error: 'กรุณาแนบรูปถ่ายบิล/ใบเสร็จ' }, { status: 400 })

  const supabase = await createClient()
  const subtotalSatang = Math.round(subtotalBaht * 100)
  const totalSatang = Math.round(totalBaht * 100)

  const { data: sameDateAndAmount, error: duplicateLookupError } = await supabase
    .from('tax_invoice_requests')
    .select('document_date, contact_tax_id, contact_name, total_satang, status')
    .eq('document_date', documentDate)
    .eq('total_satang', totalSatang)
    .eq('is_deleted', false)
  if (duplicateLookupError) {
    return NextResponse.json({ error: 'ตรวจสอบคำขอเดิมไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
  const incomingKey = {
    documentDate, contactTaxId, contactName, totalSatang,
  }
  const duplicate = sameDateAndAmount?.some(candidate =>
    !['rejected', 'failed'].includes(candidate.status)
    && isDuplicateTaxInvoiceRequest({
      documentDate: candidate.document_date,
      contactTaxId: candidate.contact_tax_id,
      contactName: candidate.contact_name,
      totalSatang: Number(candidate.total_satang),
    }, incomingKey),
  )
  if (duplicate) {
    return NextResponse.json({ error: DUPLICATE_TAX_INVOICE_REQUEST_MESSAGE }, { status: 409 })
  }

  const { data: request, error: insertError } = await supabase
    .from('tax_invoice_requests')
    .insert({
      document_date: documentDate,
      contact_group: contactGroup,
      contact_name: contactName,
      contact_tax_id: contactTaxId || null,
      contact_address: contactAddress || null,
      contact_branch: contactBranch || null,
      contact_email: contactEmail,
      description,
      subtotal_satang: subtotalSatang,
      total_satang: totalSatang,
      payment_method: paymentMethod,
      bill_image_url: billImageUrl,
      status: 'pending_review',
    })
    .select()
    .single()
  if (insertError || !request) {
    if (insertError?.code === '23505') {
      return NextResponse.json({ error: DUPLICATE_TAX_INVOICE_REQUEST_MESSAGE }, { status: 409 })
    }
    return NextResponse.json({ error: insertError?.message || 'บันทึกคำขอไม่สำเร็จ' }, { status: 500 })
  }

  const caption = `🧾 <b>คำขอใบกำกับภาษีใหม่ — รอตรวจสอบ</b>

${buildTaxInvoiceRequestDetails({
    document_date: documentDate, contact_name: contactName, contact_group: contactGroup,
    contact_tax_id: contactTaxId, contact_branch: contactBranch, contact_email: contactEmail,
    contact_address: contactAddress, description, subtotal_satang: subtotalSatang,
    total_satang: totalSatang, payment_method: paymentMethod,
  })}

กรุณาตรวจสอบรูปบิลก่อนกดอนุมัติ`

  const messageId = await sendTelegramPhoto(billImageUrl, caption, {
    topic: 'taxInvoice',
    buttons: [
      [
        { text: '✅ อนุมัติ', callback_data: `tir:approve:${request.id}` },
        { text: '❌ ปฏิเสธ', callback_data: `tir:reject:${request.id}` },
      ],
    ],
  })

  if (messageId) {
    await supabase.from('tax_invoice_requests').update({ telegram_message_id: messageId }).eq('id', request.id)
  } else {
    // sendPhoto failed (bad image URL, malformed caption, etc.) — don't let the request
    // silently strand in pending_review with no way for staff to ever see it.
    sendTelegram(
      `⚠️ <b>คำขอใบกำกับภาษีใหม่ — ส่งรูป/ปุ่มอนุมัติไม่สำเร็จ</b>\nกรุณาตรวจสอบด้วยตนเองที่ Supabase (id: ${request.id})\n👤 ${escapeHtml(contactName)}\n💰 ${totalBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`,
      'taxInvoice',
    )
  }

  return NextResponse.json({ ok: true })
}
