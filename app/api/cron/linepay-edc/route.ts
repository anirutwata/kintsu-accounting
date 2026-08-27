import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expectedEdcDates, importLinePayEdcFromGmail } from '@/lib/linePayEdcImport'
import { buildLinePayEdcFailureAlert, buildLinePayEdcManualReviewAlert, buildLinePayEdcSuccessAlert } from '@/lib/linePayEdcAlert'
import { sendTelegram } from '@/lib/telegram'

export const maxDuration = 60

async function run(req: Request) {
  const authorization = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await importLinePayEdcFromGmail(createAdminClient())
    if (result.current) {
      const sync = result.current.sync
      if (!sync.ok) throw new Error(sync.error)
      await sendTelegram(
        buildLinePayEdcSuccessAlert(
          result.current.revenueDates, result.current.settlementDate, result.current.grossAmountSatang,
          sync.cashSales.map(item => item.documentSerial), sync.settlement.documentSerial,
        ),
        'sales',
      )
      if (result.current.manualReviewTaxInvoiceIds?.length) {
        await sendTelegram(
          buildLinePayEdcManualReviewAlert(result.current.revenueDates[0], result.current.manualReviewTaxInvoiceIds),
          'sales',
        )
      }
    }
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const dates = expectedEdcDates()
    const telegramAlertSent = await sendTelegram(
      buildLinePayEdcFailureAlert(dates.revenueDate, dates.settlementDate, message),
      'sales',
    )
    if (!telegramAlertSent) console.error('LINE Pay EDC cron failed and Telegram alert delivery also failed')
    return NextResponse.json({ error: message, telegramAlertSent }, { status: 500 })
  }
}

export const GET = run
export const POST = run
