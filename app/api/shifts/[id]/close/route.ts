import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { countDenominations } from '@/lib/money'
import { sendTelegram, buildShiftClosedMessage } from '@/lib/telegram'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const cookieStore = await cookies()
  const userId = cookieStore.get('kintsu_acc_user_id')?.value
  const userName = cookieStore.get('kintsu_acc_name')?.value || 'ไม่ระบุ'

  const { denominations } = await req.json()

  // Get shift info
  const { data: shift } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', id)
    .eq('status', 'open')
    .single()

  if (!shift) return NextResponse.json({ error: 'ไม่พบกะที่เปิดอยู่' }, { status: 404 })

  // Count actual cash from denominations
  const closingCashSatang = countDenominations(denominations || {})

  // Calculate expected cash: float + cash sales - cash expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('total_satang')
    .eq('shift_id', id)
    .eq('payment_method', 'เงินสด')
    .eq('is_deleted', false)

  const cashExpenses = (expenses || []).reduce((s, e) => s + e.total_satang, 0)
  const expectedCash = shift.float_satang - cashExpenses
  const variance = closingCashSatang - expectedCash

  const { data, error } = await supabase
    .from('shifts')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: userId || null,
      closing_cash_satang: closingCashSatang,
      cash_variance_satang: variance,
      closing_denominations: denominations || {},
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send Telegram notification
  sendTelegram(buildShiftClosedMessage({
    shiftName: shift.shift_name,
    date: shift.date,
    revenueSatang: 0, // will be added when sales module complete
    expensesSatang: cashExpenses,
    varianceSatang: variance,
    closedBy: userName,
  }))

  return NextResponse.json(data)
}
