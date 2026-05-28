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

  // Convert file to base64
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = buffer.toString('base64')
  const hash = crypto.createHash('md5').update(buffer).digest('hex')

  // Check cache: same slip hash → return cached result
  const { data: cached } = await supabase
    .from('ocr_jobs')
    .select('ocr_data')
    .eq('image_hash', hash)
    .eq('status', 'done')
    .maybeSingle()

  if (cached?.ocr_data) {
    return NextResponse.json({ ...cached.ocr_data, cached: true, hash })
  }

  try {
    // Upload image to Supabase Storage
    const fileName = `slips/${Date.now()}_${hash.slice(0, 8)}.jpg`
    const { data: uploadData } = await supabase.storage
      .from('slips')
      .upload(fileName, buffer, { contentType: file.type || 'image/jpeg', upsert: false })

    const imageUrl = uploadData
      ? supabase.storage.from('slips').getPublicUrl(fileName).data.publicUrl
      : null

    // Call Claude Haiku Vision — cost ~$0.0008/image
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
            text: `อ่านสลิปโอนเงินนี้และดึงข้อมูลต่อไปนี้เป็น JSON:
{
  "amount_satang": <จำนวนเงิน x100 เป็น integer เช่น ฿1,500.00 = 150000>,
  "date": "<YYYY-MM-DD วันที่โอน>",
  "time": "<HH:MM เวลาโอน เช่น 14:30>",
  "ref_number": "<เลขอ้างอิง / Transaction ID>",
  "sender_name": "<ชื่อผู้โอน / ชื่อบัญชีต้นทาง>",
  "sender_bank": "<ธนาคารผู้โอน เช่น KBANK SCB KTB BBL TTB GSB>",
  "sender_account": "<เลขบัญชีผู้โอน แบบ masked เช่น xxx-x-xxxxx-x>",
  "recipient": "<ชื่อผู้รับเงิน / ชื่อบัญชีปลายทาง>",
  "recipient_bank": "<ธนาคารผู้รับ>",
  "confidence": <0.0-1.0 ความมั่นใจในการอ่าน>
}
ถ้าหาข้อมูลไม่ได้ให้ใส่ "" หรือ 0 ตอบเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายเพิ่ม`,
          },
        ],
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const ocrData = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    // Save result to ocr_jobs for caching
    await supabase.from('ocr_jobs').insert({
      image_path: fileName,
      image_hash: hash,
      status: 'done',
      ocr_data: ocrData,
    })

    return NextResponse.json({ ...ocrData, cached: false, hash, slip_image_url: imageUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
