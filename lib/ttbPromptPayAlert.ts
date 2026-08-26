import { escapeHtml } from './telegram'
import { formatBaht } from './money'

export function buildTtbPromptPaySuccessAlert(reportDate: string, amountSatang: number, documentSerial: string): string {
  return `✅ <b>TTB Smart Shop: Sync กับ FlowAccount สำเร็จ</b>
📅 รายงานวันที่ <b>${escapeHtml(reportDate)}</b>
💰 ยอด ${formatBaht(amountSatang)}
📄 ${escapeHtml(documentSerial)}`
}

export function buildTtbPromptPayFailureAlert(expectedDate: string, error: string): string {
  return `🚨 <b>TTB Smart Shop: ไม่สามารถยืนยันการ Sync กับ FlowAccount</b>
📅 รายงานวันที่ <b>${escapeHtml(expectedDate)}</b>
🕒 ตรวจอัตโนมัติรอบ 03:00 น.
⚠️ สาเหตุ: ${escapeHtml(error)}

กรุณาตรวจ FlowAccount ก่อนลองใหม่ เพราะอาจมี JV รอ Void จากนั้นตรวจอีเมล ไฟล์รายงาน การตั้งค่าบัญชี และลอง Sync TTB อีกครั้งในหน้า “รายรับ”`
}
