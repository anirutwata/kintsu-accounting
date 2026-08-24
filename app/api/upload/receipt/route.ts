import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Images are already downscaled and re-encoded to a bounded JPEG client-side
// (lib/compressImage.ts) before they ever reach this route — sharp used to redo that
// work here, but its native libvips binary reliably failed to load in Vercel's deployed
// function (ERR_DLOPEN_FAILED, missing .so file), breaking every upload. The client-side
// pass covers the same goal without a native dependency on the server at all.
export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

    const supabase = await createClient()
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const hash = crypto.createHash('md5').update(buffer).digest('hex')
    const contentType = file.type || 'image/jpeg'
    const ext = file.name.split('.').pop() || 'jpg'

    const fileName = `receipts/${Date.now()}_${hash.slice(0, 8)}.${ext}`

    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(fileName, buffer, { contentType, upsert: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(data.path)
    return NextResponse.json({ url: urlData.publicUrl })
  } catch (err: any) {
    // Surface the real failure (module load, request parsing, etc.) instead of a bare
    // 500 with no body — the client needs this to show something more than "try again".
    console.error('upload/receipt failed:', err)
    return NextResponse.json({ error: err?.message || 'อัปโหลดล้มเหลว' }, { status: 500 })
  }
}
