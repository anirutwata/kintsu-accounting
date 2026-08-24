import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFoodCostFromStock, getLaborCostFromHR } from '@/lib/integrations'
import { calcBps } from '@/lib/money'
import type { KPIResult } from '@/types'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') // YYYY-MM

  if (!month) return NextResponse.json({ error: 'กรุณาระบุเดือน' }, { status: 400 })

  const [y, m] = month.split('-').map(Number)
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`

  // Fetch sales for month
  const { data: sales } = await supabase
    .from('daily_sales')
    .select('total_net_satang, total_vat_satang, grabfood_gp_fee_satang')
    .gte('date', `${month}-01`)
    .lt('date', `${nextMonth}-01`)

  const totalRevenue = (sales || []).reduce((s, r) => s + r.total_net_satang, 0)
  const totalVat = (sales || []).reduce((s, r) => s + r.total_vat_satang, 0)
  const grabGpCost = (sales || []).reduce((s, r) => s + r.grabfood_gp_fee_satang, 0)

  // Fetch expenses for month — filter by document_date (invoice date, not payment date)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, category, total_satang, vat_satang')
    .gte('document_date', `${month}-01`)
    .lt('document_date', `${nextMonth}-01`)
    .eq('is_deleted', false)

  // Line items (when an expense has them) are the source of truth for cost-bucket
  // classification, since one bill can span several categories — an expense with no
  // items (saved before line items existed, or a simple one-line entry) falls back to
  // its own category/total_satang below.
  const expenseIds = (expenses || []).map((e) => e.id)
  const { data: itemRows } = expenseIds.length
    ? await supabase.from('expense_items').select('expense_id, category, total_satang').in('expense_id', expenseIds).eq('is_deleted', false)
    : { data: [] as { expense_id: string; category: string; total_satang: number }[] }
  const itemsByExpenseId = new Map<string, { category: string; total_satang: number }[]>()
  for (const row of itemRows || []) {
    const list = itemsByExpenseId.get(row.expense_id) ?? []
    list.push(row)
    itemsByExpenseId.set(row.expense_id, list)
  }

  const FOOD_COST_CATS = ['วัตถุดิบทางตรง-เนื้อวัว', 'วัตถุดิบทางตรง-เนื้อหมู', 'วัตถุดิบทางตรง-อื่นๆ']
  const LABOR_COST_CATS = ['เงินเดือนพนักงานประจำและสวัสดิการ', 'เงินเดือน- part time']
  const ASSET_CATS = ['ส่วนต่อเติมอาคาร', 'ระบบ', 'อุปกรณ์ครัว', 'อุปกรณ์ทั่วไปในร้านอาหาร', 'สินทรัพย์อื่นๆ']

  function costFor(catList: string[]) {
    let sum = 0
    for (const e of expenses || []) {
      const items = itemsByExpenseId.get(e.id)
      if (items) {
        sum += items.filter((i) => catList.includes(i.category)).reduce((s, i) => s + i.total_satang, 0)
      } else if (catList.includes(e.category)) {
        sum += e.total_satang
      }
    }
    return sum
  }

  const manualFoodCost = costFor(FOOD_COST_CATS)
  const manualLaborCost = costFor(LABOR_COST_CATS)
  const otherExpenses = (() => {
    const excluded = [...FOOD_COST_CATS, ...LABOR_COST_CATS, ...ASSET_CATS]
    let sum = 0
    for (const e of expenses || []) {
      const items = itemsByExpenseId.get(e.id)
      if (items) {
        sum += items.filter((i) => !excluded.includes(i.category)).reduce((s, i) => s + i.total_satang, 0)
      } else if (!excluded.includes(e.category)) {
        sum += e.total_satang
      }
    }
    return sum
  })()
  const totalVatPaid = (expenses || []).reduce((s, e) => s + (e.vat_satang || 0), 0)

  // Pull from integrations (may override manual values)
  const [stockData, hrData] = await Promise.all([
    getFoodCostFromStock(month),
    getLaborCostFromHR(month),
  ])

  const foodCost = stockData.source === 'kintsu_stock'
    ? stockData.foodCostSatang + stockData.wasteCostSatang
    : manualFoodCost

  const laborCost = hrData.source === 'kintsu_hr'
    ? hrData.laborCostSatang
    : manualLaborCost

  // Fetch assets and calculate depreciation for the month
  const monthLastDay = new Date(y, m, 0).toISOString().slice(0, 10)
  const { data: assets } = await supabase
    .from('assets')
    .select('purchase_date, purchase_satang, salvage_satang, useful_life_months')
    .eq('is_active', true)
    .lte('purchase_date', monthLastDay)

  const depreciationSatang = (assets || []).reduce((sum, asset) => {
    const pd = new Date(asset.purchase_date)
    const monthsElapsed = (y - pd.getFullYear()) * 12 + (m - 1 - pd.getMonth())
    if (monthsElapsed < 0 || monthsElapsed >= asset.useful_life_months) return sum
    return sum + Math.round((asset.purchase_satang - asset.salvage_satang) / asset.useful_life_months)
  }, 0)

  const totalExpenses = foodCost + laborCost + otherExpenses + grabGpCost + depreciationSatang
  const grossProfit = totalRevenue - foodCost
  const netProfit = totalRevenue - totalExpenses
  const vatPayable = totalVat - totalVatPaid

  // Fetch target
  const { data: target } = await supabase
    .from('monthly_targets')
    .select('*')
    .eq('id', month)
    .maybeSingle()

  const revenueAchBps = target?.revenue_target_satang
    ? calcBps(totalRevenue, target.revenue_target_satang)
    : 0

  const kpi: KPIResult = {
    totalRevenueSatang: totalRevenue,
    foodCostSatang: foodCost,
    laborCostSatang: laborCost,
    grabGpCostSatang: grabGpCost,
    depreciationSatang,
    otherExpensesSatang: otherExpenses,
    totalExpensesSatang: totalExpenses,
    grossProfitSatang: grossProfit,
    netProfitSatang: netProfit,
    foodCostBps: calcBps(foodCost, totalRevenue),
    laborCostBps: calcBps(laborCost, totalRevenue),
    netProfitBps: calcBps(netProfit, totalRevenue),
    vatPayableSatang: vatPayable,
    revenueAchievementBps: revenueAchBps,
    foodCostVarianceBps: target ? target.food_cost_target_bps - calcBps(foodCost, totalRevenue) : 0,
    netProfitVarianceBps: target ? calcBps(netProfit, totalRevenue) - target.net_profit_target_bps : 0,
    foodCostSource: stockData.source,
    laborCostSource: hrData.source,
  }

  return NextResponse.json(kpi)
}
