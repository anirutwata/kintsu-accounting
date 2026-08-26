import { escapeHtml } from './telegram'

export function buildLinePayEdcFailureAlert(revenueDate: string, settlementDate: string, error: string): string {
  return `🚨 <b>LINE Pay EDC: ไม่สามารถยืนยันการ Sync กับ FlowAccount</b>
📅 วันที่ขาย <b>${escapeHtml(revenueDate)}</b>
🏦 Settlement <b>${escapeHtml(settlementDate)}</b>
🕒 ตรวจอัตโนมัติรอบ 12:00 น.
⚠️ สาเหตุ: ${escapeHtml(error)}

กรุณาตรวจ FlowAccount ก่อนลองใหม่ เพราะอาจมี Cash Sale หรือ JV รอ Void จากนั้นตรวจอีเมล ไฟล์ CSV และผังบัญชี`
}
