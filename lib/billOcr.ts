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
  hasWht: boolean
  whtSatang: number
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
          text: `อ่านบิล/ใบเสร็จ/ใบกำกับภาษีนี้ เพื่อตรวจสอบว่ามีภาษีมูลค่าเพิ่ม (VAT) และ/หรือภาษีหัก ณ ที่จ่าย แสดงอยู่หรือไม่ ตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบาย:
{
  "has_vat": <true เฉพาะเมื่อเห็นคำว่า "ภาษีมูลค่าเพิ่ม"/"VAT"/"มูลค่าเพิ่ม 7%" พร้อมยอดตัวเลขบนบิลจริงๆ เท่านั้น ห้ามเดา ถ้าไม่แน่ใจให้ false>,
  "vat_baht": <ยอด VAT เป็นบาท ตามตัวเลขที่ระบุตรงๆ บนบิล ถ้า has_vat เป็น false ให้ใส่ 0>,
  "has_wht": <true เฉพาะเมื่อเห็นคำว่า "หัก ณ ที่จ่าย"/"ภาษีหัก ณ ที่จ่าย"/"Withholding Tax" พร้อมยอดตัวเลขบนบิลจริงๆ เท่านั้น (มักอยู่แถวเดียวกับ "ยอดชำระ" ที่เป็นยอดสุทธิหลังหัก) ห้ามเดา ถ้าไม่แน่ใจให้ false>,
  "wht_baht": <ยอดภาษีหัก ณ ที่จ่ายเป็นบาท ตามตัวเลขที่ระบุตรงๆ บนบิล ถ้า has_wht เป็น false ให้ใส่ 0>,
  "total_baht": <ยอดรวม/จำนวนเงินรวมทั้งสิ้นตามบิล (ก่อนหักภาษี ณ ที่จ่าย ถ้ามี) สำหรับใช้ตรวจสอบไขว้ ถ้าอ่านไม่ได้ให้ใส่ 0>,
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
      hasWht: !!parsed.has_wht,
      whtSatang: Math.round((parsed.wht_baht ?? 0) * 100),
      totalSatang: parsed.total_baht ? Math.round(parsed.total_baht * 100) : null,
      confidence: parsed.confidence ?? 0,
    }
  } catch {
    return null
  }
}
