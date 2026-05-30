import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const supabase = await createClient()
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = buffer.toString('base64')
  const hash = crypto.createHash('md5').update(buffer).digest('hex')

  // Upload image to Supabase Storage (receipts bucket)
  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `asset-receipts/${Date.now()}_${hash.slice(0, 8)}.${ext}`
  const { data: uploadData } = await supabase.storage
    .from('receipts')
    .upload(fileName, buffer, { contentType: file.type || 'image/jpeg', upsert: false })

  const imageUrl = uploadData
    ? supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl
    : null

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `คุณคือผู้เชี่ยวชาญอ่านใบเสร็จรับเงิน ใบกำกับภาษี และสลิปโอนเงินภาษาไทย

อ่านเอกสารนี้แล้วดึงข้อมูลสินทรัพย์เป็น JSON:
{
  "name": "<ชื่อสินค้า/อุปกรณ์/สินทรัพย์ที่ซื้อ — ระบุรุ่น/ยี่ห้อด้วยถ้ามี>",
  "amount_satang": <ราคารวม x100 เป็น integer เช่น ฿15,000.00 = 1500000>,
  "date": "<YYYY-MM-DD วันที่ซื้อ/วันที่ในใบเสร็จ>",
  "vendor": "<ชื่อร้าน/บริษัทผู้ขาย>",
  "description": "<รายละเอียดเพิ่มเติม เช่น เลขที่ใบเสร็จ รุ่น serial number>",
  "confidence": <0.0-1.0>
}
ถ้าหาข้อมูลไม่ได้ให้ใส่ "" หรือ 0 ตอบเป็น JSON เท่านั้น`,
          },
        ],
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const ocrData = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    return NextResponse.json({ ...ocrData, image_url: imageUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR ล้มเหลว'
    // Still return image_url even if OCR fails
    return NextResponse.json({ error: message, image_url: imageUrl }, { status: 500 })
  }
}
