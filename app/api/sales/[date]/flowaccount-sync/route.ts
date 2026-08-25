import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncCashRevenueToFlowAccount } from '@/lib/cashRevenueSync'
import { syncCreditCardCashSale } from '@/lib/creditCardSalesSync'

// Accounting policy:
// - cash is an approved JV: Dr 11112 / Cr 41210
// - PromptPay is an approved JV created from the authoritative TTB email report
// - company transfer is not posted from the employee-entered amount
// - credit card remains a Cash Sale pending the separate tax-invoice deduplication design
export async function POST(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: day, error: dayError } = await supabase.from('daily_sales').select('*').eq('id', date).single()
  if (dayError || !day) {
    return NextResponse.json({ error: dayError?.message || 'ไม่พบยอดขายวันนี้' }, { status: 404 })
  }

  const errors: Record<string, string> = {}
  const cashResult = await syncCashRevenueToFlowAccount(supabase, date)
  if (!cashResult.ok) errors.cash = cashResult.error

  const creditCardResult = await syncCreditCardCashSale(supabase, date)
  if (!creditCardResult.ok) errors.credit_card = creditCardResult.error

  const { data: updated, error: reloadError } = await supabase.from('daily_sales').select('*').eq('id', date).single()
  if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 })
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ...updated, partialErrors: errors }, { status: 207 })
  }
  return NextResponse.json(updated)
}
