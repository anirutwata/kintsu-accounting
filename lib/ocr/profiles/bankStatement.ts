import { z } from 'zod'
import type { BankStatementOcrData } from '../types'

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string(),
  amount: z.number().positive(), type: z.enum(['in', 'out']),
}).strict()
const schema = z.object({ entries: z.array(entrySchema) }).strict()

export const bankStatementProfile = {
  name: 'bank_statement' as const,
  maxOutputTokens: 16000,
  jsonSchema: {
    type: 'object', additionalProperties: false,
    properties: { entries: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { date: { type: 'string' }, description: { type: 'string' }, amount: { type: 'number' }, type: { type: 'string', enum: ['in', 'out'] } },
      required: ['date', 'description', 'amount', 'type'],
    } } }, required: ['entries'],
  } as Record<string, unknown>,
  prompt: `ดึงธุรกรรมทุกรายการจาก Statement ธนาคารไทย แล้วตอบ JSON ตาม schema เท่านั้น
- date เป็น YYYY-MM-DD และแปลงปี พ.ศ. เป็น ค.ศ.
- amount เป็นจำนวนบวกเสมอ
- เงินเข้าใช้ type=in เงินออกใช้ type=out
- description รวมข้อความรายการและรายละเอียด ไม่รวมยอดคงเหลือ`,
  validate(raw: unknown) {
    const parsed = schema.safeParse(raw)
    return parsed.success
      ? { data: parsed.data as BankStatementOcrData, issueCodes: [] as string[] }
      : { data: null, issueCodes: ['schema_invalid'] }
  },
  isBlocking(issueCodes: string[]) { return issueCodes.length > 0 },
  failureMessage: 'ไม่สามารถอ่าน Statement ได้ในขณะนี้',
}
