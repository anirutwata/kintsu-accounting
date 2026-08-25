import { NextResponse } from 'next/server'
import { extractTaxInvoiceFieldsFromBill } from '@/lib/billOcr'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  try {
    const result = await extractTaxInvoiceFieldsFromBill(url)
    return NextResponse.json(result ?? { documentDate: null, subtotalBaht: null, totalBaht: null, paymentMethod: null, confidence: 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
