import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractItemsFromReceipt } from '@/lib/billItemsOcr'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('expense_categories')
    .select('name')
    .eq('category_type', 'expense')
    .eq('is_active', true)
  const categoryNames = (categories ?? []).map((c) => c.name as string)

  try {
    const items = await extractItemsFromReceipt(url, categoryNames)
    return NextResponse.json({ items: items ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
