import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { payFlowAccountSync } from '@/lib/expenseSync'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const result = await payFlowAccountSync(supabase, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.data)
}
