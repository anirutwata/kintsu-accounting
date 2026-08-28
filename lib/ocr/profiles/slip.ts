import { BANKS } from '../../banks'
import { slipJsonSchema } from '../schemas'

export const thaiTransferSlipProfile = {
  name: 'thai_transfer_slip' as const,
  jsonSchema: slipJsonSchema,
  prompt: `อ่านสลิปโอนเงินไทยและตอบ JSON ตาม schema เท่านั้น
- แยกผู้โอน/ผู้รับจากป้าย จาก/ถึง ไม่ใช้โลโก้แอปเป็นธนาคารบัญชี
- amount_satang เป็นยอดเงินคูณ 100 และเป็น integer
- date เป็น YYYY-MM-DD; ถ้าปี พ.ศ. ให้แปลงเป็น ค.ศ.; time เป็น HH:MM
- ธนาคารใช้ชื่อจากรายการนี้: ${BANKS.join(', ')}
- ระวังสระ วรรณยุกต์ และตัวสะกดชื่อไทย
- ห้ามเดาข้อมูลที่มองไม่เห็น; ใช้ "" หรือ 0 เมื่ออ่านไม่ได้`,
}
