import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const VALID_ROLES = ['owner', 'manager', 'cashier']

export async function POST(req: Request) {
  const { name, role } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'กรุณาใส่ชื่อ' }, { status: 400 })
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'กรุณาเลือกตำแหน่ง' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const maxAge = 60 * 60 * 24
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
