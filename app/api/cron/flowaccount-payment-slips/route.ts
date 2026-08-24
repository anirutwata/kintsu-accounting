import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncFlowAccountPaymentSlips } from '@/lib/flowaccountPaymentSlipSync'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncFlowAccountPaymentSlips(await createClient())
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
