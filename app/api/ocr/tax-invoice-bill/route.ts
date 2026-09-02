import { NextResponse } from 'next/server'
import { extractUrlDocument } from '@/lib/ocr/server'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  try {
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const result = await extractUrlDocument({ profile: 'tax_invoice_bill', url, actorKey: `public-tax-invoice:${forwardedFor}` })
    return NextResponse.json(result.data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
