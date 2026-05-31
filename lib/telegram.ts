const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function sendTelegram(message: string) {
  if (!BOT_TOKEN || !CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'HTML' }),
    })
  } catch (err) {
    console.error('Telegram failed:', err)
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
}) {
  const dep = Math.round(data.purchaseSatang / data.usefulLifeMonths)
  const action = data.isUpdate ? '🔄 แก้ไขสินทรัพย์' : '🏗️ เพิ่มสินทรัพย์'
  return `${action}
📦 <b>${data.name}</b> (${data.category})
💰 ราคาทุน: ${fmtBaht(data.purchaseSatang)}
📉 เสื่อม/เดือน: ${fmtBaht(dep)} × ${data.usefulLifeMonths} เดือน
🕐 ${thaiNow()}`
}

// Asset deleted
export function buildAssetDeleteMessage(name: string) {
  return `🗑️ <b>ลบสินทรัพย์</b>
📦 ${name}
🕐 ${thaiNow()}`
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
