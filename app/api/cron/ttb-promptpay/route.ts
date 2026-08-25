import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { expectedTtbReportDate, importTtbPromptPayFromGmail } from '@/lib/ttbPromptPayImport'
import { buildTtbPromptPayFailureAlert } from '@/lib/ttbPromptPayAlert'
import { sendTelegram } from '@/lib/telegram'

export const maxDuration = 60

async function run(req: Request) {
  const authorization = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await importTtbPromptPayFromGmail(await createClient()))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const telegramAlertSent = await sendTelegram(
      buildTtbPromptPayFailureAlert(expectedTtbReportDate(), message),
      'sales',
    )
    if (!telegramAlertSent) console.error('TTB cron failed and Telegram alert delivery also failed')
    return NextResponse.json({ error: message, telegramAlertSent }, { status: 500 })
  }
}

export const GET = run
export const POST = run
