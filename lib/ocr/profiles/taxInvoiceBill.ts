import { z } from 'zod'
import type { TaxInvoiceBillOcrData } from '../types'

const providerSchema = z.object({
  date_found: z.boolean(),
  date_day: z.number().int().nullable(),
  date_month: z.number().int().nullable(),
  date_year_ce: z.number().int().nullable(),
  subtotal_found: z.boolean(),
  subtotal_baht: z.number(),
  total_found: z.boolean(),
  total_baht: z.number(),
  payment_method_found: z.boolean(),
  payment_method: z.string().nullable(),
  confidence: z.number(),
}).strict()

const normalizedSchema = z.object({
  documentDate: z.string().nullable(), subtotalBaht: z.number().nullable(), totalBaht: z.number().nullable(),
  paymentMethod: z.enum(['cash', 'transfer', 'credit_card']).nullable(), confidence: z.number(),
}).strict()

export type RawTaxInvoiceBillJson = z.input<typeof providerSchema>

export function parseTaxInvoiceBillJson(raw: unknown): TaxInvoiceBillOcrData {
  const parsed = providerSchema.safeParse(raw)
  if (!parsed.success) throw new Error('schema_invalid')
  const day = Number(parsed.data.date_day)
  const month = Number(parsed.data.date_month)
  const year = Number(parsed.data.date_year_ce)
  const validComponents = parsed.data.date_found
    && Number.isInteger(day) && day >= 1 && day <= 31
    && Number.isInteger(month) && month >= 1 && month <= 12
    && Number.isInteger(year) && year >= 2000 && year <= 2100
  const calendarDate = validComponents ? new Date(Date.UTC(year, month - 1, day)) : null
  const validDate = calendarDate !== null
    && calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day
  return {
    documentDate: validDate ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null,
    subtotalBaht: parsed.data.subtotal_found && parsed.data.subtotal_baht > 0 ? parsed.data.subtotal_baht : null,
    totalBaht: parsed.data.total_found && parsed.data.total_baht > 0 ? parsed.data.total_baht : null,
    paymentMethod: parsed.data.payment_method_found && ['cash', 'transfer', 'credit_card'].includes(parsed.data.payment_method || '')
      ? parsed.data.payment_method as TaxInvoiceBillOcrData['paymentMethod'] : null,
    confidence: Math.min(1, Math.max(0, parsed.data.confidence)),
  }
}

export const taxInvoiceBillProfile = {
  name: 'tax_invoice_bill' as const,
  jsonSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      date_found: { type: 'boolean' }, date_day: { type: ['integer', 'null'] },
      date_month: { type: ['integer', 'null'] }, date_year_ce: { type: ['integer', 'null'] },
      subtotal_found: { type: 'boolean' }, subtotal_baht: { type: 'number' },
      total_found: { type: 'boolean' }, total_baht: { type: 'number' },
      payment_method_found: { type: 'boolean' },
      payment_method: { type: ['string', 'null'], enum: ['cash', 'transfer', 'credit_card', null] },
      confidence: { type: 'number' },
    },
    required: ['date_found', 'date_day', 'date_month', 'date_year_ce', 'subtotal_found', 'subtotal_baht', 'total_found', 'total_baht', 'payment_method_found', 'payment_method', 'confidence'],
  } as Record<string, unknown>,
  prompt: `อ่านบิลหรือใบเสร็จภาษาไทยสำหรับคำขอใบกำกับภาษี แล้วตอบ JSON ตาม schema เท่านั้น
- อ่านวันที่เป็น date_day/date_month/date_year_ce แยกกัน รูปแบบไทยเป็น DD/MM/YYYY เสมอ และแปลง พ.ศ. เป็น ค.ศ.
- subtotal_baht คือยอดก่อน VAT และ total_baht คือยอดที่ชำระจริง
- payment_method ใช้ cash, transfer หรือ credit_card เฉพาะเมื่อมีหลักฐานบนเอกสาร ห้ามเดา`,
  validate(raw: unknown) {
    const normalized = normalizedSchema.safeParse(raw)
    if (normalized.success) return { data: normalized.data, issueCodes: [] as string[] }
    try { return { data: parseTaxInvoiceBillJson(raw), issueCodes: [] as string[] } }
    catch { return { data: null, issueCodes: ['schema_invalid'] } }
  },
  isBlocking(issueCodes: string[]) { return issueCodes.length > 0 },
  failureMessage: 'ไม่สามารถอ่านบิลได้ในขณะนี้',
}
