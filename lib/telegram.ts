const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Telegram's HTML parse_mode only needs these three escaped — escape any
// user-supplied text before interpolating it into an HTML-parsed message,
// or a stray '&'/'<'/'>' can make Telegram reject the whole message.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Forum topic thread ids for the KINTSU Accounting Telegram group (created 2026-08-14)
export const TELEGRAM_TOPICS = {
  expenses: 3,    // 💸 ค่าใช้จ่าย
  sales: 4,       // 💰 ยอดขาย
  assets: 5,      // 🏗️ สินทรัพย์
  transfers: 6,   // 🏦 โอนเงิน
  taxInvoice: 7,  // 🧾 ใบกำกับภาษี
} as const

export async function sendTelegram(message: string, topic?: keyof typeof TELEGRAM_TOPICS) {
  if (!BOT_TOKEN || !CHAT_ID) return false
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        ...(topic ? { message_thread_id: TELEGRAM_TOPICS[topic] } : {}),
      }),
    })
    if (!response.ok) {
      console.error(`Telegram sendMessage failed: HTTP ${response.status}`)
      return false
    }
    const result = await response.json()
    if (!result.ok) {
      console.error('Telegram sendMessage rejected the message')
      return false
    }
    return true
  } catch (err) {
    console.error('Telegram failed:', err)
    return false
  }
}

export interface InlineButton {
  text: string
  callback_data: string
}

// Returns the sent message_id (needed later to edit the caption after approve/reject), or null on failure.
export async function sendTelegramPhoto(
  photoUrl: string,
  caption: string,
  opts: { topic?: keyof typeof TELEGRAM_TOPICS; buttons?: InlineButton[][] } = {},
): Promise<number | null> {
  if (!BOT_TOKEN || !CHAT_ID) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
        ...(opts.topic ? { message_thread_id: TELEGRAM_TOPICS[opts.topic] } : {}),
        ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
      }),
    })
    const json = await res.json()
    if (!json.ok) {
      console.error('sendTelegramPhoto failed:', json)
      return null
    }
    return json.result.message_id
  } catch (err) {
    console.error('Telegram sendPhoto failed:', err)
    return null
  }
}

// Edits a photo message's caption (e.g. after Approve/Reject) and optionally clears/replaces the buttons.
export async function editTelegramCaption(
  messageId: number,
  caption: string,
  buttons?: InlineButton[][],
) {
  if (!BOT_TOKEN || !CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        message_id: messageId,
        caption,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons ?? [] },
      }),
    })
  } catch (err) {
    console.error('Telegram editMessageCaption failed:', err)
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    })
  } catch (err) {
    console.error('Telegram answerCallbackQuery failed:', err)
  }
}

function thaiNow() {
  return new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function fmtBaht(satang: number) {
  return `฿${(satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
}

// Daily P&L summary — sent every night
export function buildDailySummary(data: {
  date: string
  totalRevenue: number
  foodCostBps: number
  laborCostBps: number
  netProfitSatang: number
  netProfitBps: number
  overdueSuppliers: number
}) {
  const profitEmoji = data.netProfitBps >= 1000 ? '✅' : data.netProfitBps >= 0 ? '⚠️' : '🔴'
  const foodEmoji = data.foodCostBps <= 3500 ? '✅' : '⚠️'
  return `📊 <b>สรุปวันนี้ — Kintsu Yakiniku</b>
${data.date}

💰 รายได้: <b>${fmtBaht(data.totalRevenue)}</b>
${foodEmoji} Food Cost: <b>${(data.foodCostBps / 100).toFixed(1)}%</b>
👥 Labor Cost: <b>${(data.laborCostBps / 100).toFixed(1)}%</b>
${profitEmoji} กำไรสุทธิ: <b>${fmtBaht(data.netProfitSatang)} (${(data.netProfitBps / 100).toFixed(1)}%)</b>
${data.overdueSuppliers > 0 ? `\n⚠️ ซัพพลายเออร์ครบกำหนด: <b>${data.overdueSuppliers} ราย</b>` : ''}
🕐 ${thaiNow()}`
}

// Shift closed alert
export function buildShiftClosedMessage(data: {
  shiftName: string
  date: string
  revenueSatang: number
  expensesSatang: number
  varianceSatang: number
  closedBy: string
}) {
  const sign = data.varianceSatang >= 0 ? '+' : ''
  return `🔒 <b>ปิดกะแล้ว — ${data.shiftName}</b>
📅 ${data.date} | ปิดโดย: ${data.closedBy}

💰 รายได้กะนี้: ${fmtBaht(data.revenueSatang)}
💸 รายจ่ายกะนี้: ${fmtBaht(data.expensesSatang)}
📦 ผลต่างเงินสด: ${sign}${fmtBaht(data.varianceSatang)}
🕐 ${thaiNow()}`
}

// Overdue supplier alert
export function buildOverdueAlert(suppliers: Array<{ name: string; amountSatang: number; daysOverdue: number }>) {
  const lines = suppliers.map(s => `• ${s.name}  ${fmtBaht(s.amountSatang)} (เกิน ${s.daysOverdue} วัน)`).join('\n')
  return `🔴 <b>ซัพพลายเออร์ค้างชำระ</b>

${lines}

🕐 ${thaiNow()}`
}

// Sales saved / updated
export function buildSalesMessage(data: {
  date: string
  isUpdate: boolean
  totalNetSatang: number
  foodstoryRev: number
  papayaRev: number
  grabNetSatang: number
  takeawayRev: number
}) {
  const parts: string[] = []
  if (data.foodstoryRev > 0) parts.push(`• Foodstory: ${fmtBaht(data.foodstoryRev)}`)
  if (data.papayaRev > 0) parts.push(`• Papaya: ${fmtBaht(data.papayaRev)}`)
  if (data.grabNetSatang > 0) parts.push(`• GrabFood (net): ${fmtBaht(data.grabNetSatang)}`)
  if (data.takeawayRev > 0) parts.push(`• Takeaway: ${fmtBaht(data.takeawayRev)}`)
  const action = data.isUpdate ? '🔄 อัปเดตรายรับ' : '💰 บันทึกรายรับ'
  return `${action}
📅 ${data.date}
${parts.length ? parts.join('\n') + '\n' : ''}💵 รวมสุทธิ: <b>${fmtBaht(data.totalNetSatang)}</b>
🕐 ${thaiNow()}`
}

// Sales deleted
export function buildSalesDeleteMessage(date: string) {
  return `🗑️ <b>ลบรายรับ</b>
📅 ${date}
🕐 ${thaiNow()}`
}

// Asset added / updated
export function buildAssetMessage(data: {
  name: string
  category: string
  purchaseSatang: number
  usefulLifeMonths: number
  isUpdate: boolean
  paymentMethod?: string | null
  paymentBank?: string | null
}) {
  const dep = Math.round(data.purchaseSatang / data.usefulLifeMonths)
  const action = data.isUpdate ? '🔄 แก้ไขสินทรัพย์' : '🏗️ เพิ่มสินทรัพย์'
  const paymentLine = data.paymentMethod
    ? `\n💳 ${data.paymentMethod}${data.paymentBank ? ` · ${data.paymentBank}` : ''}`
    : ''
  return `${action}
📦 <b>${data.name}</b> (${data.category})
💰 ราคาทุน: ${fmtBaht(data.purchaseSatang)}
📉 เสื่อม/เดือน: ${fmtBaht(dep)} × ${data.usefulLifeMonths} เดือน${paymentLine}
🕐 ${thaiNow()}`
}

// Bank transfer
export function buildTransferMessage(data: {
  date: string
  amountSatang: number
  fromBank: string
  fromAccount?: string | null
  toBank: string
  toAccount?: string | null
  note?: string | null
  isDelete: boolean
}) {
  const from = data.fromAccount ? `${data.fromBank} (${data.fromAccount})` : data.fromBank
  const to = data.toAccount ? `${data.toBank} (${data.toAccount})` : data.toBank
  if (data.isDelete) {
    return `🗑️ <b>ยกเลิกการโอนเงิน</b>
📅 ${data.date}
${fmtBaht(data.amountSatang)} · ${from} → ${to}
🕐 ${thaiNow()}`
  }
  return `🔄 <b>โอนเงินระหว่างบัญชี</b>
📅 ${data.date}
💸 ยอดโอน: <b>${fmtBaht(data.amountSatang)}</b>
🏦 จาก: ${from}
🏦 ไปยัง: ${to}${data.note ? `\n📝 ${data.note}` : ''}
🕐 ${thaiNow()}`
}

// Asset deleted
export function buildAssetDeleteMessage(name: string) {
  return `🗑️ <b>ลบสินทรัพย์</b>
📦 ${name}
🕐 ${thaiNow()}`
}

const TAX_INVOICE_CONTACT_GROUP_LABELS: Record<string, string> = { individual: 'บุคคลธรรมดา', juristic: 'นิติบุคคล' }
const TAX_INVOICE_PAYMENT_LABELS: Record<string, string> = { cash: 'เงินสด', transfer: 'โอนเงิน', credit_card: 'บัตรเครดิต (EDC)' }

// Everything the customer filled in on the public tax-invoice-request form. Shared by
// the initial Telegram notification and every later caption edit (approval failure,
// manual review) so staff never lose the original submission behind a terser status line.
export function buildTaxInvoiceRequestDetails(request: {
  document_date: string
  contact_name: string
  contact_group?: string | null
  contact_tax_id?: string | null
  contact_branch?: string | null
  contact_email: string
  contact_address?: string | null
  description: string
  subtotal_satang: number
  total_satang: number
  payment_method: string
}): string {
  const groupLabel = request.contact_group ? TAX_INVOICE_CONTACT_GROUP_LABELS[request.contact_group] : ''
  const paymentLabel = TAX_INVOICE_PAYMENT_LABELS[request.payment_method] || request.payment_method
  const subtotalBaht = (request.subtotal_satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })
  const totalBaht = (request.total_satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })
  return `📅 วันที่ในบิล: ${request.document_date}
👤 ${escapeHtml(request.contact_name)}${groupLabel ? ` (${groupLabel})` : ''}${request.contact_tax_id ? `\n🪪 ${escapeHtml(request.contact_tax_id)}` : ''}${request.contact_branch ? `\n🏢 สาขา: ${escapeHtml(request.contact_branch)}` : ''}
📧 ${escapeHtml(request.contact_email)}${request.contact_address ? `\n📍 ${escapeHtml(request.contact_address)}` : ''}
📝 ${escapeHtml(request.description)}
💰 ก่อน VAT ${subtotalBaht} → รวม ${totalBaht} บาท (${paymentLabel})`
}

// Expense recorded with slip
export function buildExpenseMessage(data: {
  category: string
  note: string
  totalSatang: number
  paymentMethod: string
  createdByName: string
}) {
  return `🧾 <b>บันทึกรายจ่ายใหม่</b>
📁 ${data.category}${data.note ? ` — ${data.note}` : ''}
💰 ${fmtBaht(data.totalSatang)} (${data.paymentMethod})
👤 ${data.createdByName}
🕐 ${thaiNow()}`
}
