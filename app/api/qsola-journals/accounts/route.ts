import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchKusolaChart } from '@/lib/kusolaGeneralJournal'

export async function GET() {
  const supabase = await createClient()
  const chart = await fetchKusolaChart()
  const rows = chart.map(account => ({ flowaccount_id: account.id, code: account.code, name_local: account.nameLocal, name_foreign: account.nameForeign, category: account.category, is_active: true }))
  if (rows.length) {
    const { error } = await supabase.from('kusola_flowaccount_accounts').upsert(rows, { onConflict: 'flowaccount_id' })
    if (error) return NextResponse.json({ error: 'บันทึกผังบัญชีไม่สำเร็จ' }, { status: 500 })
  }
  return NextResponse.json(rows)
}
