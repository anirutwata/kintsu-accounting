import { escapeHtml } from './telegram'
import { formatBaht } from './money'

export function buildLinePayEdcSuccessAlert(
  revenueDates: string[], settlementDate: string, grossAmountSatang: number,
  cashSaleSerials: string[], settlementSerial: string,
): string {
  return `✅ <b>LINE Pay EDC: Sync กับ FlowAccount สำเร็จ</b>
📅 วันที่ขาย <b>${escapeHtml(revenueDates.join(', '))}</b>
🏦 Settlement <b>${escapeHtml(settlementDate)}</b>
💰 ยอด ${formatBaht(grossAmountSatang)}
📄 ${escapeHtml(cashSaleSerials.join(', '))} · ${escapeHtml(settlementSerial)}`
}

export function buildLinePayEdcFailureAlert(revenueDate: string, settlementDate: string, error: string): string {
  return `🚨 <b>LINE Pay EDC: ไม่สามารถยืนยันการ Sync กับ FlowAccount</b>
📅 วันที่ขาย <b>${escapeHtml(revenueDate)}</b>
🏦 Settlement <b>${escapeHtml(settlementDate)}</b>
🕒 ตรวจอัตโนมัติรอบ 12:00 น.
⚠️ สาเหตุ: ${escapeHtml(error)}

กรุณาตรวจ FlowAccount ก่อนลองใหม่ เพราะอาจมี Cash Sale หรือ JV รอ Void จากนั้นตรวจอีเมล ไฟล์ CSV และผังบัญชี`
}
