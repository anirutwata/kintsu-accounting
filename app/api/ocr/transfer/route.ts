import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = buffer.toString('base64')
  const mediaType = (file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif') || 'image/jpeg'

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `คุณคือผู้เชี่ยวชาญอ่านสลิปโอนเงินภาษาไทย

อ่านสลิปนี้แล้วดึงข้อมูลเป็น JSON:
{
  "date": "<YYYY-MM-DD วันที่โอน>",
  "amount_satang": <ยอดโอน x100 เป็น integer เช่น ฿15,000.00 = 1500000>,
  "from_bank": "<ชื่อธนาคารผู้โอน เช่น SCB, KBank, Krungthai, BBL, TTB, UOB>",
  "from_account": "<เลขบัญชีผู้โอน — ตัวเลขเท่านั้น รวม xxx หรือ *>",
  "to_bank": "<ชื่อธนาคารผู้รับ>",
  "to_account": "<เลขบัญชีผู้รับ — ตัวเลขเท่านั้น>",
  "confidence": <0.0-1.0>
}
ถ้าหาข้อมูลไม่ได้ให้ใส่ "" หรือ 0 ตอบเป็น JSON เท่านั้น ไม่ต้องอธิบาย`,
          },
        ],
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const ocrData = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    return NextResponse.json(ocrData)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
