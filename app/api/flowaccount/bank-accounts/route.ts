import { NextResponse } from 'next/server'
import { getBankAccounts } from '@/lib/flowaccount'

export async function GET() {
  try {
    const accounts = await getBankAccounts()
    return NextResponse.json(accounts)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
