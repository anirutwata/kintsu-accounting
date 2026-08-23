import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import sharp from 'sharp'

// Photos straight off a phone camera commonly run 3-10MB — nobody reading a bill or
// slip needs that resolution, and it's the same image the OCR pipeline reads, which
// already downsamples to well under this anyway. Re-encoding to a bounded JPEG cuts
// storage and load time dramatically while staying easily legible.
const MAX_DIMENSION_PX = 1800
const JPEG_QUALITY = 82

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const supabase = await createClient()
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const hash = crypto.createHash('md5').update(buffer).digest('hex')

  let uploadBuffer: Buffer = buffer
  let contentType = file.type || 'image/jpeg'
  let ext = file.name.split('.').pop() || 'jpg'

  if (contentType.startsWith('image/')) {
    try {
      uploadBuffer = await sharp(buffer)
        .rotate() // apply the phone's EXIF orientation before it gets stripped below
        .resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer()
      contentType = 'image/jpeg'
      ext = 'jpg'
    } catch {
      // Not a format sharp can decode (or a corrupt file) — fall back to the original
      // bytes rather than failing the whole upload.
      uploadBuffer = buffer
    }
  }

  const fileName = `receipts/${Date.now()}_${hash.slice(0, 8)}.${ext}`

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(fileName, uploadBuffer, { contentType, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(data.path)
  return NextResponse.json({ url: urlData.publicUrl })
}
