import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncCashRevenueToFlowAccount } from '@/lib/cashRevenueSync'
import { createAdminClient } from '@/lib/supabase/admin'

// Accounting policy:
// - cash is an approved JV: Dr 11112 / Cr 41210
// - PromptPay is an approved JV created from the authoritative TTB email report
// - company transfer is not posted from the employee-entered amount
// - employee-entered credit card amounts are reconciliation-only; the authoritative
//   LINE Pay CSV cron creates the EDC Cash Sale and settlement JV separately
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
  const admin = createAdminClient()
  const { data: reconciliation, error: reconciliationError } = await admin
    .rpc('reconcile_pending_cash_tax_invoices_v3', { p_revenue_date: date })
  const cashResult = reconciliationError || reconciliation?.manual_review_ids?.length || reconciliation?.blocking_ids?.length
    ? { ok: false as const, error: reconciliationError?.message || (reconciliation?.blocking_ids?.length
      ? 'มีใบกำกับภาษีเงินสดกำลังบันทึก กรุณาลอง Sync อีกครั้ง'
      : 'ยอดเงินสดไม่พอรองรับใบกำกับภาษีที่ออกแล้ว กรุณาตรวจสอบบัญชี') }
    : await syncCashRevenueToFlowAccount(admin, date)
  if (!cashResult.ok) errors.cash = cashResult.error

  const { data: updated, error: reloadError } = await supabase.from('daily_sales').select('*').eq('id', date).single()
  if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 })
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ...updated, partialErrors: errors }, { status: 207 })
  }
  return NextResponse.json(updated)
}
