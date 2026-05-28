import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

function formatAccountNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 4) return `${digits.slice(0,3)}-${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0,3)}-${digits.slice(3,4)}-${digits.slice(4)}`
  return `${digits.slice(0,3)}-${digits.slice(3,4)}-${digits.slice(4,9)}-${digits.slice(9)}`
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { bank_name, account_number, account_name } = await req.json()
  if (!bank_name || !account_number || !account_name) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({ bank_name, account_number: formatAccountNumber(account_number), account_name })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
