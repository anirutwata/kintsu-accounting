import { NextResponse } from 'next/server'
import { getOtherPaymentChannels } from '@/lib/flowaccount'

export async function GET() {
  try {
    const channels = await getOtherPaymentChannels()
    return NextResponse.json(channels)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
