import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

async function requireOwner() {
  const cookieStore = await cookies()
  return cookieStore.get('kintsu_acc_role')?.value === 'owner'
}

export async function GET() {
  if (!await requireOwner()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, username, display_name, is_active, created_at')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  if (!await requireOwner()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { username, password, display_name } = await req.json()
  if (!username?.trim() || !password || !display_name?.trim()) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      username: username.trim().toLowerCase(),
      password_hash: bcrypt.hashSync(password, 10),
      display_name: display_name.trim(),
    })
    .select('id, username, display_name, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
