import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const supabase = await createClient()
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const hash = crypto.createHash('md5').update(buffer).digest('hex')

  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `receipts/${Date.now()}_${hash.slice(0, 8)}.${ext}`

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(fileName, buffer, { contentType: file.type || 'image/jpeg', upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(data.path)
  return NextResponse.json({ url: urlData.publicUrl })
}
