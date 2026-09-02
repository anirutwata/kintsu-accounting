import { z } from 'zod'
import type { AssetReceiptOcrData } from '../types'

const schema = z.object({
  name: z.string(), amount_satang: z.number().int(), date: z.string(), vendor: z.string(),
  description: z.string(), payment_bank: z.string(), payment_account: z.string(), confidence: z.number(),
}).strict()

export const assetReceiptProfile = {
  name: 'asset_receipt' as const,
  jsonSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      name: { type: 'string' }, amount_satang: { type: 'integer' }, date: { type: 'string' },
      vendor: { type: 'string' }, description: { type: 'string' }, payment_bank: { type: 'string' },
      payment_account: { type: 'string' }, confidence: { type: 'number' },
    },
    required: ['name', 'amount_satang', 'date', 'vendor', 'description', 'payment_bank', 'payment_account', 'confidence'],
  } as Record<string, unknown>,
  prompt: `อ่านใบเสร็จ ใบกำกับภาษี หรือสลิปภาษาไทย แล้วตอบ JSON ตาม schema เท่านั้น
- name คือชื่อสินค้า/อุปกรณ์/สินทรัพย์ รวมรุ่นหรือยี่ห้อเมื่อเห็น
- amount_satang คือราคารวมคูณ 100 เป็น integer
- date เป็น YYYY-MM-DD แปลง พ.ศ. เป็น ค.ศ.
- vendor คือผู้ขาย; description คือเลขเอกสาร รุ่น หรือ serial number
- payment_bank/payment_account คือบัญชีผู้ชำระเมื่อเป็นสลิป ห้ามเดาข้อมูลที่มองไม่เห็น`,
  validate(raw: unknown) {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return { data: null, issueCodes: ['schema_invalid'] }
    const data: AssetReceiptOcrData = {
      ...parsed.data,
      amount_satang: Math.max(0, parsed.data.amount_satang),
      confidence: Math.min(1, Math.max(0, parsed.data.confidence)),
    }
    return { data, issueCodes: [] as string[] }
  },
  isBlocking(issueCodes: string[]) { return issueCodes.length > 0 },
  failureMessage: 'ไม่สามารถอ่านเอกสารสินทรัพย์ได้ในขณะนี้',
}
