import { z } from 'zod'
import type { ExpenseBillOcrData } from '../types'

const providerSchema = z.object({
  document_date_found: z.boolean(), document_date_day: z.number().int().nullable(),
  document_date_month: z.number().int().nullable(), document_date_year_ce: z.number().int().nullable(),
  has_vat: z.boolean(), vat_baht: z.number(), vat_inclusive: z.boolean(),
  has_wht: z.boolean(), wht_baht: z.number(),
  has_discount: z.boolean(), discount_baht: z.number(),
  total_baht: z.number(), confidence: z.number(),
  vendor_name: z.string(), vendor_address: z.string(), vendor_tax_id: z.string(), vendor_branch: z.string(),
  items: z.array(z.object({
    description: z.string(), quantity: z.number(), unit: z.string(),
    price_per_unit: z.number(), suggested_category: z.string().nullable(),
  }).strict()),
}).strict()

const normalizedSchema = z.object({
  documentDate: z.string().nullable(),
  hasVat: z.boolean(), vatSatang: z.number().int(), vatInclusive: z.boolean(),
  hasWht: z.boolean(), whtSatang: z.number().int(), hasDiscount: z.boolean(), discountSatang: z.number().int(),
  totalSatang: z.number().int().nullable(), confidence: z.number(),
  vendor: z.object({ name: z.string(), address: z.string(), taxId: z.string(), branch: z.string() }).strict(),
  items: z.array(z.object({
    description: z.string(), quantity: z.number(), unit: z.string(), pricePerUnit: z.number(),
    suggestedCategory: z.string().nullable(),
  }).strict()),
}).strict()

export const expenseBillProfile = {
  name: 'expense_bill' as const,
  maxOutputTokens: 2048,
  jsonSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      document_date_found: { type: 'boolean' }, document_date_day: { type: ['integer', 'null'] },
      document_date_month: { type: ['integer', 'null'] }, document_date_year_ce: { type: ['integer', 'null'] },
      has_vat: { type: 'boolean' }, vat_baht: { type: 'number' }, vat_inclusive: { type: 'boolean' },
      has_wht: { type: 'boolean' }, wht_baht: { type: 'number' },
      has_discount: { type: 'boolean' }, discount_baht: { type: 'number' },
      total_baht: { type: 'number' }, confidence: { type: 'number' },
      vendor_name: { type: 'string' }, vendor_address: { type: 'string' },
      vendor_tax_id: { type: 'string' }, vendor_branch: { type: 'string' },
      items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        description: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' },
        price_per_unit: { type: 'number' }, suggested_category: { type: ['string', 'null'] },
      }, required: ['description', 'quantity', 'unit', 'price_per_unit', 'suggested_category'] } },
    },
    required: ['document_date_found', 'document_date_day', 'document_date_month', 'document_date_year_ce', 'has_vat', 'vat_baht', 'vat_inclusive', 'has_wht', 'wht_baht', 'has_discount', 'discount_baht', 'total_baht', 'confidence', 'vendor_name', 'vendor_address', 'vendor_tax_id', 'vendor_branch', 'items'],
  } as Record<string, unknown>,
  prompt(categoryNames: string[]) {
    return `อ่านบิล ใบเสร็จ หรือใบกำกับภาษีภาษาไทย แล้วตอบ JSON ตาม schema ในครั้งเดียว
- อ่านวันที่เอกสาร, VAT, ภาษีหัก ณ ที่จ่าย, ส่วนลด, ยอดรวม, ข้อมูลผู้ขาย และรายการสินค้าทุกบรรทัด
- วันที่เอกสารตอบเป็น document_date_day/document_date_month/document_date_year_ce; แปลง พ.ศ. เป็น ค.ศ. และห้ามใช้วันที่ชำระจากสลิป
- vendor_* คือผู้ออกเอกสาร ไม่ใช่ชื่อลูกค้า; ถ้าไม่เห็นให้ใช้ข้อความว่าง
- ยอดเงินทุกช่องเป็นบาทตามตัวเลขที่เห็น ห้ามเดา
- suggested_category ต้องเป็นหนึ่งใน: ${categoryNames.join(', ')} หรือ null
- ถ้าไม่มีรายการสินค้าให้ items เป็น [] และห้ามสร้างยอดรวมเป็นรายการสินค้า`
  },
  validate(raw: unknown, categoryNames: string[] = []) {
    const normalized = normalizedSchema.safeParse(raw)
    if (normalized.success) {
      return { data: {
        ...normalized.data,
        items: normalized.data.items.map(item => ({
          ...item,
          suggestedCategory: item.suggestedCategory && categoryNames.includes(item.suggestedCategory) ? item.suggestedCategory : null,
        })),
      }, issueCodes: [] as string[] }
    }
    const parsed = providerSchema.safeParse(raw)
    if (!parsed.success) return { data: null, issueCodes: ['schema_invalid'] }
    const amount = (found: boolean, value: number) => found && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0
    const day = Number(parsed.data.document_date_day)
    const month = Number(parsed.data.document_date_month)
    const year = Number(parsed.data.document_date_year_ce)
    const calendarDate = parsed.data.document_date_found ? new Date(Date.UTC(year, month - 1, day)) : null
    const documentDate = calendarDate
      && calendarDate.getUTCFullYear() === year
      && calendarDate.getUTCMonth() === month - 1
      && calendarDate.getUTCDate() === day
      && year >= 2000 && year <= 2100
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
    const data: ExpenseBillOcrData = {
      documentDate,
      hasVat: parsed.data.has_vat, vatSatang: amount(parsed.data.has_vat, parsed.data.vat_baht),
      vatInclusive: parsed.data.has_vat && parsed.data.vat_inclusive,
      hasWht: parsed.data.has_wht, whtSatang: amount(parsed.data.has_wht, parsed.data.wht_baht),
      hasDiscount: parsed.data.has_discount, discountSatang: amount(parsed.data.has_discount, parsed.data.discount_baht),
      totalSatang: parsed.data.total_baht > 0 ? Math.round(parsed.data.total_baht * 100) : null,
      confidence: Math.min(1, Math.max(0, parsed.data.confidence)),
      vendor: {
        name: parsed.data.vendor_name.trim(), address: parsed.data.vendor_address.trim(),
        taxId: parsed.data.vendor_tax_id.replace(/\D/g, ''), branch: parsed.data.vendor_branch.trim(),
      },
      items: parsed.data.items.map(item => ({
        description: item.description.trim(), quantity: item.quantity > 0 ? item.quantity : 1,
        unit: item.unit.trim() || 'รายการ', pricePerUnit: item.price_per_unit > 0 ? item.price_per_unit : 0,
        suggestedCategory: item.suggested_category && categoryNames.includes(item.suggested_category) ? item.suggested_category : null,
      })),
    }
    return { data, issueCodes: [] as string[] }
  },
  isBlocking(issueCodes: string[]) { return issueCodes.length > 0 },
  failureMessage: 'ไม่สามารถอ่านบิลได้ในขณะนี้',
}
