// Reads an attached bill/receipt/tax-invoice photo to detect whether it shows VAT
// and/or withholding tax already deducted, and if so, how much — called from the
// expense form right after a receipt photo is uploaded, so staff can review/correct
// the auto-filled fields before saving (unlike lib/vendorOcr.ts's extraction, which
// runs silently server-side during sync).
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ExtractedBillVat {
  hasVat: boolean
  vatSatang: number
  vatInclusive: boolean
  hasWht: boolean
  whtSatang: number
  hasDiscount: boolean
  discountSatang: number
  totalSatang: number | null
  confidence: number
}

export async function extractVatFromReceipt(imageUrl: string): Promise<ExtractedBillVat | null> {
  const res = await fetch(imageUrl)
  if (!res.ok) return null
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) return null // PDFs etc. — vision endpoint only handles images
  const mediaType = contentType.includes('png') ? 'image/png' : 'image/jpeg'
  const base64 = buffer.toString('base64')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `อ่านบิล/ใบเสร็จ/ใบกำกับภาษีนี้ เพื่อตรวจสอบภาษีมูลค่าเพิ่ม (VAT), ส่วนลด, และภาษีหัก ณ ที่จ่าย ตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบาย:
{
  "has_vat": <true เฉพาะเมื่อเห็นคำว่า "ภาษีมูลค่าเพิ่ม"/"VAT"/"มูลค่าเพิ่ม 7%" พร้อมยอดตัวเลขบนบิลจริงๆ เท่านั้น ห้ามเดา ถ้าไม่แน่ใจให้ false>,
  "vat_baht": <ยอด VAT เป็นบาท ตามตัวเลขที่ระบุตรงๆ บนบิล ถ้า has_vat เป็น false ให้ใส่ 0>,
  "vat_inclusive": <true เฉพาะเมื่อราคาต่อหน่วย/ยอดรวมสินค้าที่พิมพ์บนบิล "รวม VAT อยู่แล้ว" ไม่มีการบวก VAT แยกเพิ่มอีกทีตอนคำนวณยอดรวมทั้งสิ้น (เช่น ใบเสร็จร้านค้าปลีกที่ราคาโชว์รวมภาษีบนป้าย) — false เมื่อบิลแสดงยอดก่อน VAT (เช่น "รวมเป็นเงิน") แล้วบวก VAT แยกเป็นอีกบรรทัดต่างหากเพื่อได้ "จำนวนเงินรวมทั้งสิ้น" (แบบใบกำกับภาษี/ใบวางบิลทั่วไปส่วนใหญ่) ถ้า has_vat เป็น false ใส่ false>,
  "has_discount": <true เฉพาะเมื่อเห็นคำว่า "ส่วนลด"/"Discount" พร้อมยอดตัวเลขบนบิลจริงๆ เท่านั้น ห้ามเดา>,
  "discount_baht": <ยอดส่วนลดเป็นบาท ตามตัวเลขที่ระบุตรงๆ บนบิล ถ้า has_discount เป็น false ให้ใส่ 0>,
  "has_wht": <true เฉพาะเมื่อเห็นคำว่า "หัก ณ ที่จ่าย"/"ภาษีหัก ณ ที่จ่าย"/"Withholding Tax" พร้อมยอดตัวเลขบนบิลจริงๆ เท่านั้น (มักอยู่แถวเดียวกับ "ยอดชำระ" ที่เป็นยอดสุทธิหลังหัก) ห้ามเดา ถ้าไม่แน่ใจให้ false>,
  "wht_baht": <ยอดภาษีหัก ณ ที่จ่ายเป็นบาท ตามตัวเลขที่ระบุตรงๆ บนบิล ถ้า has_wht เป็น false ให้ใส่ 0>,
  "total_baht": <ยอดรวม/จำนวนเงินรวมทั้งสิ้นตามบิล (หลังหักส่วนลด รวม VAT แล้ว แต่ก่อนหักภาษี ณ ที่จ่าย ถ้ามี) สำหรับใช้ตรวจสอบไขว้ ถ้าอ่านไม่ได้ให้ใส่ 0>,
  "confidence": <0.0-1.0 ความมั่นใจโดยรวม>
}`,
        },
      ],
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    return {
      hasVat: !!parsed.has_vat,
      vatSatang: Math.round((parsed.vat_baht ?? 0) * 100),
      vatInclusive: !!parsed.vat_inclusive,
      hasWht: !!parsed.has_wht,
      whtSatang: Math.round((parsed.wht_baht ?? 0) * 100),
      hasDiscount: !!parsed.has_discount,
      discountSatang: Math.round((parsed.discount_baht ?? 0) * 100),
      totalSatang: parsed.total_baht ? Math.round(parsed.total_baht * 100) : null,
      confidence: parsed.confidence ?? 0,
    }
  } catch {
    return null
  }
}

// Reads a customer-submitted bill photo on the public ขอใบกำกับภาษี form to pre-fill
// วันที่ในบิล/ยอดก่อน VAT/ยอดชำระจริง/ช่องทางชำระเงิน — the same fields staff would otherwise
// have to read off the photo and type in by hand. The customer can still edit any of these
// before submitting; the tax-invoice-request API also re-validates the amounts independently
// (future-date rejection, VAT reconciliation tolerance), so a wrong OCR read here can't
// itself produce a bad tax invoice — only a form the customer has to correct.
export interface ExtractedTaxInvoiceBill {
  documentDate: string | null // YYYY-MM-DD (Gregorian), null if not confidently read
  subtotalBaht: number | null // ยอดก่อน VAT
  totalBaht: number | null // ยอดรวมที่ชำระจริง
  paymentMethod: 'cash' | 'transfer' | 'credit_card' | null
  confidence: number
}

interface RawTaxInvoiceBillJson {
  date_found?: boolean
  date_day?: unknown
  date_month?: unknown
  date_year_ce?: unknown
  subtotal_found?: boolean
  subtotal_baht?: unknown
  total_found?: boolean
  total_baht?: unknown
  payment_method_found?: boolean
  payment_method?: unknown
  confidence?: unknown
}

// Exported for unit testing the date-assembly/validation logic without mocking the
// Anthropic SDK. Day/month/year are read as three separate fields (see the prompt
// below) rather than having the model assemble an ISO string itself — a bill dated
// e.g. "01/09/2569" is genuinely ambiguous as a single string (both halves are valid
// day-or-month numbers), and asking the model to label which number is which
// resists the classic DD/MM-vs-MM/DD swap far better than asking it to convert
// straight to YYYY-MM-DD in one step.
export function parseTaxInvoiceBillJson(parsed: RawTaxInvoiceBillJson): ExtractedTaxInvoiceBill {
  const day = Number(parsed.date_day)
  const month = Number(parsed.date_month)
  const year = Number(parsed.date_year_ce)
  const validComponents = !!parsed.date_found
    && Number.isInteger(day) && day >= 1 && day <= 31
    && Number.isInteger(month) && month >= 1 && month <= 12
    && Number.isInteger(year) && year >= 2000 && year <= 2100
  const isoDate = validComponents
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null
  const calendarDate = validComponents ? new Date(Date.UTC(year, month - 1, day)) : null
  const validDate = calendarDate !== null
    && calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day
  const validPaymentMethod = !!parsed.payment_method_found
    && ['cash', 'transfer', 'credit_card'].includes(parsed.payment_method as string)
  return {
    documentDate: validDate ? isoDate : null,
    subtotalBaht: parsed.subtotal_found ? Number(parsed.subtotal_baht) || null : null,
    totalBaht: parsed.total_found ? Number(parsed.total_baht) || null : null,
    paymentMethod: validPaymentMethod ? (parsed.payment_method as ExtractedTaxInvoiceBill['paymentMethod']) : null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
  }
}

export async function extractTaxInvoiceFieldsFromBill(imageUrl: string): Promise<ExtractedTaxInvoiceBill | null> {
  const res = await fetch(imageUrl)
  if (!res.ok) return null
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) return null
  const mediaType = contentType.includes('png') ? 'image/png' : 'image/jpeg'
  const base64 = buffer.toString('base64')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `อ่านบิล/ใบเสร็จนี้ เพื่อดึง 4 ค่า: วันที่บนบิล, ยอดก่อน VAT, ยอดชำระจริงสุทธิ, ช่องทางชำระเงิน ตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบาย:
{
  "date_found": <true เฉพาะเมื่อเห็นวันที่ระบุตรงๆ บนบิล (เช่น "วันที่", "Date") ห้ามเดา>,
  "date_day": <ตัวเลขวันที่ (1-31) ตามที่ปรากฏบนบิล ถ้า date_found เป็น false ให้ใส่ null>,
  "date_month": <ตัวเลขเดือน (1-12) ตามที่ปรากฏบนบิล — บิลและสลิปเครื่องรูดบัตรในไทยแทบทั้งหมดพิมพ์วันที่แบบ วัน/เดือน/ปี (DD/MM/YYYY) ตัวเลขตัวแรกคือ "วันที่" ตัวเลขตัวที่สองคือ "เดือน" เสมอ ไม่ใช่รูปแบบเดือน/วัน/ปีแบบอเมริกัน (MM/DD/YYYY) แม้ตัวเลขทั้งสองตัวจะน้อยกว่าหรือเท่ากับ 12 ก็ตาม (เช่น "01/09/2569" ต้องอ่านว่า วันที่ 1 เดือน 9 (กันยายน) ห้ามอ่านเป็นเดือน 1 (มกราคม) วันที่ 9 เด็ดขาด) ถ้า date_found เป็น false ให้ใส่ null>,
  "date_year_ce": <ปีคริสต์ศักราช (ค.ศ., 4 หลัก) ตามที่ปรากฏบนบิล — ถ้าบิลแสดงปีเป็นพุทธศักราช (พ.ศ., เลข 4 หลักที่มากกว่า 2400) ให้ลบ 543 ก่อนตอบ เช่น 2569 (พ.ศ.) → 2026 (ค.ศ.) ถ้า date_found เป็น false ให้ใส่ null>,
  "subtotal_found": <true เฉพาะเมื่อเห็นยอดก่อน VAT ระบุตรงๆ บนบิล (เช่น "รวมเป็นเงิน", "Sub Total", "Before VAT" — ยอดก่อนบวก VAT 7%) ห้ามเดา ถ้าบิลไม่แยก VAT ให้ใส่ false>,
  "subtotal_baht": <ยอดก่อน VAT เป็นบาท ถ้า subtotal_found เป็น false ให้ใส่ 0>,
  "total_found": <true เฉพาะเมื่อเห็นยอดชำระจริงสุทธิระบุตรงๆ บนบิล (เช่น "จำนวนเงินรวมทั้งสิ้น", "ยอดชำระ", "Grand Total" — ยอดสุดท้ายที่ลูกค้าจ่ายจริง รวม VAT แล้ว) ห้ามเดา>,
  "total_baht": <ยอดชำระจริงเป็นบาท ถ้า total_found เป็น false ให้ใส่ 0>,
  "payment_method_found": <true เฉพาะเมื่อเห็นหลักฐานชัดเจนบนบิลว่าลูกค้าชำระด้วยช่องทางใด (เช่น ช่อง "เงินสด"/"โอนเงิน"/"บัตรเครดิต" ถูกกา, หรือเป็นสลิปโอนเงินจากแอปธนาคาร, หรือมีข้อความจากเครื่องรูดบัตร EDC) ห้ามเดา ถ้าบิลไม่ได้ระบุวิธีชำระเงินไว้ให้ใส่ false>,
  "payment_method": <"cash" ถ้าเห็นหลักฐานว่าชำระด้วยเงินสด, "transfer" ถ้าเห็นหลักฐานว่าโอนเงินผ่านธนาคาร/แอปธนาคาร, "credit_card" ถ้าเห็นหลักฐานว่าชำระด้วยบัตรเครดิต/เดบิตผ่านเครื่องรูดบัตร (EDC) — ถ้า payment_method_found เป็น false ให้ใส่ null>,
  "confidence": <0.0-1.0 ความมั่นใจโดยรวม>
}`,
        },
      ],
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return parseTaxInvoiceBillJson(JSON.parse(match[0]))
  } catch {
    return null
  }
}
