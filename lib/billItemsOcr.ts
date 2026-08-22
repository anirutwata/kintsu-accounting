// Reads an attached bill/receipt photo and extracts every line item (not just the
// grand total) — used to populate the itemized expense form so one bill can span
// multiple categories instead of forcing a single lump-sum amount+category.
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ExtractedBillItem {
  description: string
  quantity: number
  unit: string
  pricePerUnit: number
  suggestedCategory: string | null // one of the category names passed in, or null if unsure
}

export async function extractItemsFromReceipt(imageUrl: string, categoryNames: string[]): Promise<ExtractedBillItem[] | null> {
  const res = await fetch(imageUrl)
  if (!res.ok) return null
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) return null // PDFs etc. — vision endpoint only handles images
  const mediaType = contentType.includes('png') ? 'image/png' : 'image/jpeg'
  const base64 = buffer.toString('base64')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `อ่านบิล/ใบเสร็จนี้ ดึงรายการสินค้าทุกรายการที่ระบุไว้ (ไม่ใช่แค่ยอดรวม) ตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบาย:
{
  "items": [
    {
      "description": "<ชื่อสินค้าตามที่พิมพ์บนบิล>",
      "quantity": <จำนวน ตัวเลข>,
      "unit": "<หน่วย เช่น ชิ้น กก. ลัง ถ้าไม่ระบุให้ใส่ 'รายการ'>",
      "price_per_unit": <ราคาต่อหน่วยเป็นบาท ตัวเลข>,
      "suggested_category": "<เลือก 1 ชื่อจากรายการนี้เท่านั้นที่ตรงกับสินค้านี้ที่สุด: ${categoryNames.join(', ')} — ถ้าไม่มีอันไหนตรงเลยให้ใส่ null ห้ามสร้างชื่อใหม่>"
    }
  ]
}
ถ้าอ่านรายการไม่ได้เลยให้ items เป็น [] อย่าเดายอดรวมเป็นรายการเดียว ต้องแยกทีละรายการสินค้าจริงตามบิล`,
        },
      ],
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    const items = Array.isArray(parsed.items) ? parsed.items : []
    return items.map((i: any) => ({
      description: i.description ?? '',
      quantity: Number(i.quantity) || 1,
      unit: i.unit || 'รายการ',
      pricePerUnit: Number(i.price_per_unit) || 0,
      suggestedCategory: categoryNames.includes(i.suggested_category) ? i.suggested_category : null,
    }))
  } catch {
    return null
  }
}
