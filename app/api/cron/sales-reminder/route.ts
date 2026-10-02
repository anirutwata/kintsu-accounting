import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { missingSalesDates, SALES_LOCK_START_DATE, thaiShortDate } from '@/lib/dailySalesLock'
import { sendTelegram } from '@/lib/telegram'
import { getTodayBKK } from '@/lib/utils'

// Morning reminder: alert the sales topic when yesterday (or any earlier day since the
// lock started) still has no revenue entered by staff.
async function run(req: Request) {
  const authorization = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = getTodayBKK()
  const { data, error } = await createAdminClient().from('daily_sales')
    .select('id').gte('id', SALES_LOCK_START_DATE).lt('id', today).not('manual_entered_at', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const missing = missingSalesDates((data || []).map(row => row.id), today)
  if (!missing.length) return NextResponse.json({ missing_dates: [] })

  const sent = await sendTelegram([
    '⚠️ <b>ยังไม่ได้บันทึกรายรับ</b>',
    ...missing.map(date => `• ${thaiShortDate(date)}`),
    '',
    'ระบบจะไม่ให้บันทึกวันถัดไปจนกว่าจะบันทึกวันที่ค้างให้ครบ (ร้านปิดให้กรอก 0 แล้วกดบันทึก)',
  ].join('\n'), 'sales')
  return NextResponse.json({ missing_dates: missing, telegramAlertSent: sent })
}

export const GET = run
export const POST = run
