import { NextResponse } from 'next/server'
import { sendTelegram, buildDailySummary, buildOverdueAlert } from '@/lib/telegram'

export async function POST(req: Request) {
  const { type, data } = await req.json()
  let message = ''

  switch (type) {
    case 'daily_summary':
      message = buildDailySummary(data)
      break
    case 'overdue_alert':
      message = buildOverdueAlert(data.suppliers)
      break
    case 'raw':
      message = data.text
      break
    default:
      return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  }

  await sendTelegram(message)
  return NextResponse.json({ ok: true })
}
