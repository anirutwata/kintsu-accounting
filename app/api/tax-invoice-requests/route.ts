import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const cookieStore = await cookies()
  if (!cookieStore.get('kintsu_acc_user_id')?.value) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })
  }

  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')

  let query = supabase.from('tax_invoice_requests').select('*')
    .eq('is_deleted', false).order('created_at', { ascending: false })
  if (month) query = query.gte('document_date', `${month}-01`).lte('document_date', `${month}-31`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
