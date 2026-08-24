import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { previewFlowAccountPaymentSlipSync, syncFlowAccountPaymentSlips } from '@/lib/flowaccountPaymentSlipSync'

export async function GET() {
  try {
    return NextResponse.json(await previewFlowAccountPaymentSlipSync(await createClient()))
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST() {
  try {
    const result = await syncFlowAccountPaymentSlips(await createClient())
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
