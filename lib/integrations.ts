// Cross-system integrations: KINTSU Stock + KINTSU HR
// Pulls food cost and labor cost data for P&L calculation

import { createClient as createStockClient } from '@supabase/supabase-js'
import { createClient as createHrClient } from '@supabase/supabase-js'

function getStockClient() {
  const url = process.env.KINTSU_STOCK_SUPABASE_URL
  const key = process.env.KINTSU_STOCK_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createStockClient(url, key)
}

function getHrClient() {
  const url = process.env.KINTSU_HR_SUPABASE_URL
  const key = process.env.KINTSU_HR_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createHrClient(url, key)
}

// Pull food cost from KINTSU Stock: sum of goods received + waste for the month
export async function getFoodCostFromStock(monthKey: string): Promise<{
  foodCostSatang: number
  wasteCostSatang: number
  source: 'kintsu_stock' | 'unavailable'
}> {
  const supabase = getStockClient()
  if (!supabase) return { foodCostSatang: 0, wasteCostSatang: 0, source: 'unavailable' }

  try {
    const startDate = `${monthKey}-01`
    const [year, month] = monthKey.split('-').map(Number)
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10)

    // Goods received (purchase cost)
    const { data: receiving } = await supabase
      .from('goods_receiving_items')
      .select('total_cost')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59')

    // Waste logs
    const { data: waste } = await supabase
      .from('waste_logs')
      .select('cost_satang')
      .gte('date', startDate)
      .lte('date', endDate)

    const foodCostSatang = (receiving ?? []).reduce((sum, r) => sum + Math.round((r.total_cost ?? 0) * 100), 0)
    const wasteCostSatang = (waste ?? []).reduce((sum, w) => sum + (w.cost_satang ?? 0), 0)

    return { foodCostSatang, wasteCostSatang, source: 'kintsu_stock' }
  } catch {
    return { foodCostSatang: 0, wasteCostSatang: 0, source: 'unavailable' }
  }
}

// Pull labor cost from KINTSU HR: total payroll for the month
export async function getLaborCostFromHR(monthKey: string): Promise<{
  laborCostSatang: number
  employeeCount: number
  source: 'kintsu_hr' | 'unavailable'
}> {
  const supabase = getHrClient()
  if (!supabase) return { laborCostSatang: 0, employeeCount: 0, source: 'unavailable' }

  try {
    // Try payslips table first
    const { data: payslips } = await supabase
      .from('payslips')
      .select('net_pay, employee_id')
      .eq('month', monthKey)
      .eq('status', 'approved')

    if (payslips && payslips.length > 0) {
      const laborCostSatang = payslips.reduce((sum, p) => sum + Math.round((p.net_pay ?? 0) * 100), 0)
      const employeeCount = new Set(payslips.map(p => p.employee_id)).size
      return { laborCostSatang, employeeCount, source: 'kintsu_hr' }
    }

    return { laborCostSatang: 0, employeeCount: 0, source: 'unavailable' }
  } catch {
    return { laborCostSatang: 0, employeeCount: 0, source: 'unavailable' }
  }
}
