import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { groupExpensesByPaymentSlip, type PaymentSlipExpense } from '@/lib/paymentSlipGrouping'

export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get('month')
  const supabase = await createClient()
  let query = supabase
    .from('expenses')
    .select('id, date, document_date, recipient_name, total_satang, wht_satang, flowaccount_document_serial, flowaccount_payment_slip_serial, flowaccount_payment_channel, flowaccount_reference, flowaccount_payment_status')
    .eq('source', 'flowaccount_payment_slip')
    .eq('is_deleted', false)
    .not('flowaccount_payment_slip_serial', 'is', null)
    .order('date', { ascending: false })

  if (month) {
    const [year, monthNumber] = month.split('-').map(Number)
    const nextMonth = monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`
    query = query.gte('date', `${month}-01`).lt('date', nextMonth)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const groups = groupExpensesByPaymentSlip((data ?? []) as PaymentSlipExpense[])
  return NextResponse.json({
    data: groups,
    totalPaymentSlips: groups.length,
    totalExpenses: groups.reduce((sum, group) => sum + group.expenses.length, 0),
    totalSatang: groups.reduce((sum, group) => sum + group.total_satang, 0),
  })
}
