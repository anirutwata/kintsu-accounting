// Reads the seller's name/address/tax id off an attached bill/receipt/tax-invoice photo —
// used as a fallback when findContact() (lib/flowaccount.ts) finds no existing FlowAccount
// contact to reuse, so a brand-new vendor still gets a real address instead of a blank one.
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ExtractedVendorInfo {
  name: string
  address: string
  taxId: string
  branch: string
}

export async function extractVendorInfoFromReceipt(imageUrl: string): Promise<ExtractedVendorInfo | null> {
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
          text: `อ่านหัวเอกสาร (บิล/ใบเสร็จ/ใบกำกับภาษี) นี้อย่างละเอียด แล้วดึงข้อมูล "ผู้ขาย/ผู้จำหน่าย" (ผู้ออกเอกสาร มุมบนซ้ายมักเป็นชื่อบริษัทตัวใหญ่ — ไม่ใช่ "ชื่อลูกค้า"/"ที่อยู่ลูกค้า") เป็น JSON เท่านั้น ไม่ต้องมีคำอธิบาย:
{
  "name": "<ชื่อเต็มบริษัท/ร้านผู้ขาย ตามที่พิมพ์ เช่น 'บริษัท ไทยน้ำทิพย์ คอร์ปอเรชั่น จำกัด (มหาชน)'>",
  "address": "<ที่อยู่ผู้ขายเต็ม รวมรหัสไปรษณีย์ถ้ามี>",
  "taxId": "<เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย ถ้ามี ไม่ใช่ของลูกค้า>",
  "branch": "<สาขาผู้ขาย เช่น 'สำนักงานใหญ่' หรือรหัสสาขา ถ้ามี>"
}
ถ้าอ่านไม่ได้หรือหาไม่เจอให้ใส่ ""`,
        },
      ],
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (!parsed.address) return null
    return { name: parsed.name ?? '', address: parsed.address ?? '', taxId: parsed.taxId ?? '', branch: parsed.branch ?? '' }
  } catch {
    return null
  }
}
