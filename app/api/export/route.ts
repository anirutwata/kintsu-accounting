import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function escapeCSV(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const apiKey = searchParams.get('key')
  const month = searchParams.get('month') // YYYY-MM
  const type = searchParams.get('type') || 'json'

  if (apiKey !== process.env.EXPORT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month. Use YYYY-MM' }, { status: 400 })
  }

  const supabase = await createClient()
  const startDate = `${month}-01`
  const [ey, em] = month.split('-').map(Number)
  const endDate = `${month}-${String(new Date(ey, em, 0).getDate()).padStart(2, '0')}`

  // assets_only mode: just return all assets (for GAS sync_assets action)
  if (searchParams.get('assets_only') === 'true') {
    const { data: assets } = await supabase
      .from('assets')
      .select('name, category, purchase_date, purchase_satang, salvage_satang, useful_life_months, description, is_active, payment_method, payment_bank, payment_account')
      .order('purchase_date', { ascending: false })
    const assetsData = (assets || []).map(a => ({
      name: a.name,
      category: a.category,
      purchase_date: a.purchase_date,
      purchase_amount: a.purchase_satang / 100,
      salvage_amount: a.salvage_satang / 100,
      useful_life_months: a.useful_life_months,
      monthly_dep: Math.round((a.purchase_satang - a.salvage_satang) / a.useful_life_months) / 100,
      description: a.description || '',
      is_active: a.is_active,
      payment_method: a.payment_method || '',
      payment_bank: a.payment_bank || '',
      payment_account: a.payment_account || '',
    }))
    return NextResponse.json({ assets: assetsData })
  }

  const [{ data: expenses }, { data: sales }, { data: catRows }, { data: assetRows }, { data: transferRows }] = await Promise.all([
    supabase
      .from('expenses')
      .select('date, transfer_time, category, amount_satang, payment_method, sender_bank, sender_account, recipient_name, note, created_by_name, created_at')
      .eq('is_deleted', false)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('created_at'),
    supabase
      .from('daily_sales')
      .select('date, dine_in_revenue_satang, dine_in_covers, dine_in_bills, papaya_revenue_satang, papaya_covers, papaya_bills, grabfood_gross_satang, grabfood_gp_fee_satang, grabfood_net_satang, grabfood_orders, takeaway_revenue_satang, takeaway_orders, total_net_satang')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date'),
    supabase
      .from('expense_categories')
      .select('name, category_type')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('assets')
      .select('name, category, purchase_date, purchase_satang, salvage_satang, useful_life_months, description, is_active, payment_method, payment_bank, payment_account')
      .order('purchase_date', { ascending: false }),
    supabase
      .from('bank_transfers')
      .select('date, amount_satang, from_bank, from_account, to_bank, to_account, note, created_by_name')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('created_at'),
  ])

  const expenseRows = (expenses || []).map(e => {
    const bkk = new Date(new Date(e.created_at).getTime() + 7 * 60 * 60 * 1000)
    return {
      date: e.date,
      time: e.transfer_time || '',
      category: e.category,
      amount: e.amount_satang / 100,
      payment_method: e.payment_method,
      bank: e.sender_bank || '',
      account: e.sender_account || '',
      recipient: e.recipient_name || '',
      note: e.note || '',
      recorded_by: e.created_by_name || '',
      recorded_date: bkk.toISOString().slice(0, 10),
      recorded_time: bkk.toISOString().slice(11, 16),
    }
  })

  const salesRows = (sales || []).map(s => ({
    date: s.date,
    dine_in: s.dine_in_revenue_satang / 100,
    dine_in_covers: s.dine_in_covers,
    dine_in_bills: s.dine_in_bills,
    papaya: s.papaya_revenue_satang / 100,
    papaya_covers: s.papaya_covers,
    papaya_bills: s.papaya_bills,
    grabfood_gross: s.grabfood_gross_satang / 100,
    grabfood_gp: s.grabfood_gp_fee_satang / 100,
    grabfood_net: s.grabfood_net_satang / 100,
    grabfood_orders: s.grabfood_orders,
    takeaway: s.takeaway_revenue_satang / 100,
    takeaway_orders: s.takeaway_orders,
    total_net: s.total_net_satang / 100,
  }))

  if (type === 'csv') {
    const expHeaders = ['วันที่', 'เวลา', 'หมวดหมู่', 'ยอดเงิน', 'วิธีชำระ', 'ธนาคาร', 'เลขบัญชี', 'ผู้รับเงิน', 'หมายเหตุ', 'บันทึกโดย']
    const salesHeaders = ['วันที่', 'Dine-in', 'จำนวนโต๊ะ', 'GrabFood (Gross)', 'GP 30%', 'GrabFood (Net)', 'Takeaway', 'รวมสุทธิ']

    const expLines = [
      `=== รายจ่าย ${month} ===`,
      expHeaders.map(escapeCSV).join(','),
      ...expenseRows.map(e => [e.date, e.time, e.category, e.amount, e.payment_method, e.bank, e.account, e.recipient, e.note, e.recorded_by].map(escapeCSV).join(',')),
      '',
      `=== รายรับ ${month} ===`,
      salesHeaders.map(escapeCSV).join(','),
      ...salesRows.map(s => [s.date, s.dine_in, s.dine_in_covers, s.grabfood_gross, s.grabfood_gp, s.grabfood_net, s.takeaway, s.total_net].map(escapeCSV).join(',')),
    ]

    return new Response('\uFEFF' + expLines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kintsu-${month}.csv"`,
      },
    })
  }

  const categories = (catRows || []).map(c => ({ name: c.name, type: c.category_type || 'expense' }))
  const assetsData = (assetRows || []).map(a => ({
    name: a.name,
    category: a.category,
    purchase_date: a.purchase_date,
    purchase_amount: a.purchase_satang / 100,
    salvage_amount: a.salvage_satang / 100,
    useful_life_months: a.useful_life_months,
    monthly_dep: Math.round((a.purchase_satang - a.salvage_satang) / a.useful_life_months) / 100,
    description: a.description || '',
    is_active: a.is_active,
    payment_method: a.payment_method || '',
    payment_bank: a.payment_bank || '',
    payment_account: a.payment_account || '',
  }))

  const transfersData = (transferRows || []).map(t => ({
    date: t.date,
    amount: t.amount_satang / 100,
    from_bank: t.from_bank,
    from_account: t.from_account || '',
    to_bank: t.to_bank,
    to_account: t.to_account || '',
    note: t.note || '',
    recorded_by: t.created_by_name || '',
  }))

  return NextResponse.json({ month, expenses: expenseRows, sales: salesRows, categories, assets: assetsData, transfers: transfersData })
}
