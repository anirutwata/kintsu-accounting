import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

const STAFF_ROLES = ['manager', 'cashier', 'purchasing']

export async function POST(req: Request) {
  const body = await req.json()
  const { role } = body
  const cookieStore = await cookies()
  const maxAge = 60 * 60 * 24

  if (role === 'owner') {
    const { username, password } = body
    if (!username?.trim() || !password) {
      return NextResponse.json({ error: 'กรุณาใส่ชื่อผู้ใช้และรหัสผ่าน' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: admin } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username.trim().toLowerCase())
      .eq('is_active', true)
      .single()

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return NextResponse.json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }

    cookieStore.set('kintsu_acc_user_id', admin.id, { httpOnly: true, secure: true, maxAge, path: '/' })
    cookieStore.set('kintsu_acc_role', 'owner', { httpOnly: false, secure: true, maxAge, path: '/' })
    cookieStore.set('kintsu_acc_name', admin.display_name, { httpOnly: false, secure: true, maxAge, path: '/' })
    return NextResponse.json({ ok: true, name: admin.display_name, role: 'owner' })
  }

  // Staff login — name only, no password
  const { name } = body
  if (!name?.trim()) {
    return NextResponse.json({ error: 'กรุณาใส่ชื่อ' }, { status: 400 })
  }
  if (!STAFF_ROLES.includes(role)) {
    return NextResponse.json({ error: 'กรุณาเลือกตำแหน่ง' }, { status: 400 })
  }

  cookieStore.set('kintsu_acc_user_id', name.trim(), { httpOnly: true, secure: true, maxAge, path: '/' })
  cookieStore.set('kintsu_acc_role', role, { httpOnly: false, secure: true, maxAge, path: '/' })
  cookieStore.set('kintsu_acc_name', name.trim(), { httpOnly: false, secure: true, maxAge, path: '/' })
  return NextResponse.json({ ok: true, name: name.trim(), role })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('kintsu_acc_user_id')
  cookieStore.delete('kintsu_acc_role')
  cookieStore.delete('kintsu_acc_name')
  return NextResponse.json({ ok: true })
}
