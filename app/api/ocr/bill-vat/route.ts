import { NextResponse } from 'next/server'
import { extractVatFromReceipt } from '@/lib/billOcr'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  try {
    const result = await extractVatFromReceipt(url)
    return NextResponse.json(result ?? { hasVat: false, vatSatang: 0, hasWht: false, whtSatang: 0, totalSatang: null, confidence: 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
