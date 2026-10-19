import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifyOcrSessionToken } from '@/lib/ocr/session'
import { syncExpenseToFlowAccount } from '@/lib/expenseSync'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // The HMAC-signed session cookie (lib/ocr/session) — kintsu_acc_user_id alone is unsigned/forgeable.
  const secret = process.env.OCR_SESSION_SIGNING_SECRET
  if (!secret || !verifyOcrSessionToken((await cookies()).get('kintsu_acc_ocr_session')?.value, secret)) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  }
  const { id } = await params
  const supabase = await createClient()
  const result = await syncExpenseToFlowAccount(supabase, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 'alreadySynced' in result ? 409 : 400 })
  return NextResponse.json(result.data)
}
