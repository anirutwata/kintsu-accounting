import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { missingSalesDates, SALES_LOCK_START_DATE } from '@/lib/dailySalesLock'

// GET /api/sales/missing?before=YYYY-MM-DD → days before `before` nobody has entered yet.
export async function GET(req: Request) {
  const before = new URL(req.url).searchParams.get('before') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) return NextResponse.json({ error: 'วันที่ไม่ถูกต้อง' }, { status: 400 })
  if (before <= SALES_LOCK_START_DATE) return NextResponse.json({ missing_dates: [] })

  const supabase = await createClient()
  const { data, error } = await supabase.from('daily_sales')
    .select('id').gte('id', SALES_LOCK_START_DATE).lt('id', before).not('manual_entered_at', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ missing_dates: missingSalesDates((data || []).map(row => row.id), before) })
}
