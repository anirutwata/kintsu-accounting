import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('is_active', true)
    .order('role')

  return NextResponse.json(data || [])
}
