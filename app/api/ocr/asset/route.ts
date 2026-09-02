import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractUrlDocument } from '@/lib/ocr/server'

export async function POST(req: Request) {
  const formData = await req.formData()
  const value = formData.get('file')
  if (!(value instanceof File)) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const supabase = await createClient()
  const buffer = Buffer.from(await value.arrayBuffer())
  const hash = createHash('md5').update(buffer).digest('hex')
  const extension = value.type === 'image/png' ? 'png' : value.type === 'image/webp' ? 'webp' : 'jpg'
  const fileName = `asset-receipts/${Date.now()}_${hash.slice(0, 8)}.${extension}`
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('receipts').upload(fileName, buffer, { contentType: value.type || 'image/jpeg', upsert: false })
  if (uploadError || !uploadData) return NextResponse.json({ error: 'อัปโหลดรูปไม่สำเร็จ' }, { status: 502 })
  const imageUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl

  try {
    const result = await extractUrlDocument({
      profile: 'asset_receipt', url: imageUrl,
      schemaVersion: `${process.env.OCR_SCHEMA_VERSION || '1'}-asset-v1`, actorKey: 'asset-form',
    })
    return NextResponse.json({ ...result.data, image_url: imageUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message, image_url: imageUrl }, { status: 502 })
  }
}
