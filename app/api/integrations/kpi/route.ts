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

  // Fetch sales for month
  const { data: sales } = await supabase
    .from('daily_sales')
    .select('total_net_satang, total_vat_satang, grabfood_gp_fee_satang')
    .gte('date', `${month}-01`)
    .lte('date', `${month}-31`)

  const totalRevenue = (sales || []).reduce((s, r) => s + r.total_net_satang, 0)
  const totalVat = (sales || []).reduce((s, r) => s + r.total_vat_satang, 0)
  const grabGpCost = (sales || []).reduce((s, r) => s + r.grabfood_gp_fee_satang, 0)

  // Fetch expenses for month
  const { data: expenses } = await supabase
    .from('expenses')
    .select('category, total_satang, vat_satang')
    .gte('date', `${month}-01`)
    .lte('date', `${month}-31`)
    .eq('is_deleted', false)

  const FOOD_COST_CATS = ['วัตถุดิบทางตรง-เนื้อวัว', 'วัตถุดิบทางตรง-เนื้อหมู', 'วัตถุดิบทางตรง-อื่นๆ']
  const LABOR_COST_CATS = ['เงินเดือนพนักงานประจำและสวัสดิการ', 'เงินเดือน- part time']
  const ASSET_CATS = ['ส่วนต่อเติมอาคาร', 'ระบบ', 'อุปกรณ์ครัว', 'อุปกรณ์ทั่วไปในร้านอาหาร', 'สินทรัพย์อื่นๆ']

  const manualFoodCost = (expenses || [])
    .filter(e => FOOD_COST_CATS.includes(e.category))
    .reduce((s, e) => s + e.total_satang, 0)
  const manualLaborCost = (expenses || [])
    .filter(e => LABOR_COST_CATS.includes(e.category))
    .reduce((s, e) => s + e.total_satang, 0)
  const otherExpenses = (expenses || [])
    .filter(e => ![...FOOD_COST_CATS, ...LABOR_COST_CATS, ...ASSET_CATS].includes(e.category))
    .reduce((s, e) => s + e.total_satang, 0)
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

  const totalExpenses = foodCost + laborCost + otherExpenses + grabGpCost
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
