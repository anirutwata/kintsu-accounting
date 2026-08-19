import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramPhoto, sendTelegram, escapeHtml } from '@/lib/telegram'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAYMENT_METHODS = ['cash', 'transfer', 'credit_card'] as const
const PAYMENT_LABELS: Record<string, string> = { cash: 'เงินสด', transfer: 'โอนเงิน', credit_card: 'บัตรเครดิต (EDC)' }
const CONTACT_GROUPS = ['individual', 'juristic'] as const
const CONTACT_GROUP_LABELS: Record<string, string> = { individual: 'บุคคลธรรมดา', juristic: 'นิติบุคคล' }
// Fixed line-item description — not customer-editable, so every invoice reads the same way.
const FIXED_DESCRIPTION = 'ค่าอาหาร และเครื่องดื่ม'

export async function POST(req: Request) {
  const body = await req.json()
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

  if (!contactGroup) return NextResponse.json({ error: 'กรุณาเลือกประเภทผู้เสียภาษี' }, { status: 400 })
  if (!contactName) return NextResponse.json({ error: 'กรุณากรอกชื่อลูกค้า/บริษัท' }, { status: 400 })
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) return NextResponse.json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' }, { status: 400 })
  if (contactTaxId && contactTaxId.length !== 13) return NextResponse.json({ error: 'เลขผู้เสียภาษีต้องมี 13 หลัก' }, { status: 400 })
  if (!subtotalBaht || subtotalBaht <= 0) return NextResponse.json({ error: 'กรุณากรอกยอดก่อน VAT ให้ถูกต้อง' }, { status: 400 })
  if (!totalBaht || totalBaht <= 0) return NextResponse.json({ error: 'กรุณากรอกยอดเงินให้ถูกต้อง' }, { status: 400 })
  if (totalBaht < subtotalBaht) return NextResponse.json({ error: 'ยอดรวมต้องไม่น้อยกว่ายอดก่อน VAT' }, { status: 400 })
  if (!paymentMethod) return NextResponse.json({ error: 'กรุณาเลือกช่องทางชำระเงิน' }, { status: 400 })
  if (!billImageUrl) return NextResponse.json({ error: 'กรุณาแนบรูปถ่ายบิล/ใบเสร็จ' }, { status: 400 })

  const supabase = await createClient()
  const subtotalSatang = Math.round(subtotalBaht * 100)
  const totalSatang = Math.round(totalBaht * 100)

  const { data: request, error: insertError } = await supabase
    .from('tax_invoice_requests')
    .insert({
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
    return NextResponse.json({ error: insertError?.message || 'บันทึกคำขอไม่สำเร็จ' }, { status: 500 })
  }

  const caption = `🧾 <b>คำขอใบกำกับภาษีใหม่ — รอตรวจสอบ</b>

👤 ${escapeHtml(contactName)} (${CONTACT_GROUP_LABELS[contactGroup]})${contactTaxId ? `\n🪪 ${contactTaxId}` : ''}${contactBranch ? `\n🏢 สาขา: ${escapeHtml(contactBranch)}` : ''}
📧 ${escapeHtml(contactEmail)}
📝 ${escapeHtml(description)}
💰 ก่อน VAT ${subtotalBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })} → รวม ${totalBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท (${PAYMENT_LABELS[paymentMethod]})

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
