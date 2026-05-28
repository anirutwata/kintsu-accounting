import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const { name } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'กรุณาเลือกชื่อ' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('id, name, role')
    .ilike('name', name.trim())
    .eq('is_active', true)
    .maybeSingle()

  if (!user) {
    return NextResponse.json({ error: 'ไม่พบชื่อนี้ในระบบ' }, { status: 401 })
  }

  const cookieStore = await cookies()
  const maxAge = 60 * 60 * 24
  cookieStore.set('kintsu_acc_user_id', user.id, { httpOnly: true, secure: true, maxAge, path: '/' })
  cookieStore.set('kintsu_acc_role', user.role, { httpOnly: false, secure: true, maxAge, path: '/' })
  cookieStore.set('kintsu_acc_name', user.name, { httpOnly: false, secure: true, maxAge, path: '/' })

  return NextResponse.json({ ok: true, name: user.name, role: user.role })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('kintsu_acc_user_id')
  cookieStore.delete('kintsu_acc_role')
  cookieStore.delete('kintsu_acc_name')
  return NextResponse.json({ ok: true })
}
