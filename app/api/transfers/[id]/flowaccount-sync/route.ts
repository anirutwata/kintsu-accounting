import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncBankTransferToFlowAccount } from '@/lib/bankTransferSync'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params
  const result = await syncBankTransferToFlowAccount(supabase, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json(result)
}
