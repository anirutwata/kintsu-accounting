import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  const { pin } = await req.json()
  if (!pin || pin.length < 4) {
    return NextResponse.json({ error: 'กรุณาใส่ PIN ให้ครบ 4 หลัก' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, name, role, pin_hash')
    .eq('is_active', true)

  if (!users) return NextResponse.json({ error: 'ระบบขัดข้อง' }, { status: 500 })

  // Check PIN against all active users
  let matched = null
  for (const user of users) {
    const ok = await bcrypt.compare(pin, user.pin_hash)
    if (ok) { matched = user; break }
  }

  if (!matched) {
    return NextResponse.json({ error: 'PIN ไม่ถูกต้อง' }, { status: 401 })
  }

  const cookieStore = await cookies()
  const maxAge = 60 * 60 * 24 // 24 hours
  cookieStore.set('kintsu_acc_user_id', matched.id, { httpOnly: true, secure: true, maxAge, path: '/' })
  cookieStore.set('kintsu_acc_role', matched.role, { httpOnly: false, secure: true, maxAge, path: '/' })
  cookieStore.set('kintsu_acc_name', matched.name, { httpOnly: false, secure: true, maxAge, path: '/' })

  return NextResponse.json({ ok: true, name: matched.name, role: matched.role })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('kintsu_acc_user_id')
  cookieStore.delete('kintsu_acc_role')
  cookieStore.delete('kintsu_acc_name')
  return NextResponse.json({ ok: true })
}
