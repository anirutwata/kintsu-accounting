import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractUrlDocument, expenseBillSchemaVersion } from '@/lib/ocr/server'
import { verifyOcrSessionToken } from '@/lib/ocr/session'

export async function POST(req: Request) {
  const secret = process.env.OCR_SESSION_SIGNING_SECRET
  const session = secret ? verifyOcrSessionToken((await cookies()).get('kintsu_acc_ocr_session')?.value, secret) : null
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })
  const supabase = await createClient()
  const { data: categories } = await supabase.from('expense_categories').select('name').eq('category_type', 'expense').eq('is_active', true)
  const categoryNames = (categories ?? []).map(category => String(category.name))
  try {
    const result = await extractUrlDocument({
      profile: 'expense_bill', url, context: { categoryNames },
      schemaVersion: expenseBillSchemaVersion(categoryNames),
      actorKey: `expense:${session.role}:${createHash('sha256').update(session.actorId).digest('hex')}`,
    })
    return NextResponse.json(result.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR ล้มเหลว'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
