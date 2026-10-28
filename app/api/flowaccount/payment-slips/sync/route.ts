import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { previewFlowAccountPaymentSlipSync, syncFlowAccountPaymentSlips } from '@/lib/flowaccountPaymentSlipSync'

// the FlowAccount fetch + per-document lookups can exceed the default function limit
export const maxDuration = 300

export async function GET() {
  try {
    return NextResponse.json(await previewFlowAccountPaymentSlipSync(await createClient()))
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST() {
  try {
    // 60 days is enough for the manual button; the nightly cron does the full backfill.
    const result = await syncFlowAccountPaymentSlips(await createClient(), { sinceDays: 60 })
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
