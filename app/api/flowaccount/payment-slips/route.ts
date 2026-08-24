import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { groupExpensesByPaymentSlip, type PaymentSlipExpense, type PaymentSlipLocalPayment } from '@/lib/paymentSlipGrouping'

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

  const [{ data, error }, { data: localPayments, error: localPaymentsError }] = await Promise.all([
    query,
    supabase
      .from('payment_slip_local_payments')
      .select('id, payment_slip_serial, payment_date, bank_account_id, amount_satang, slip_image_url, note, recorded_by_name, bank_accounts(bank_name, account_number)')
      .eq('is_deleted', false),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (localPaymentsError) return NextResponse.json({ error: localPaymentsError.message }, { status: 500 })
  const mappedLocalPayments = (localPayments ?? []).map(payment => {
    const account = Array.isArray(payment.bank_accounts) ? payment.bank_accounts[0] : payment.bank_accounts
    return {
      ...payment,
      bank_name: account?.bank_name ?? '',
      account_number: account?.account_number ?? '',
    }
  }) as PaymentSlipLocalPayment[]
  const groups = groupExpensesByPaymentSlip((data ?? []) as PaymentSlipExpense[], mappedLocalPayments)
  return NextResponse.json({
    data: groups,
    totalPaymentSlips: groups.length,
    totalExpenses: groups.reduce((sum, group) => sum + group.expenses.length, 0),
    totalSatang: groups.reduce((sum, group) => sum + group.total_satang, 0),
  })
}
