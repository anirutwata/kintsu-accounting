'use client'
import { useState, useEffect } from 'react'
import { formatBaht, formatPct } from '@/lib/money'
import { getMonthKey, formatThaiMonth } from '@/lib/utils'
import type { KPIResult, DailySales } from '@/types'
import RevenueChart from '@/components/dashboard/RevenueChart'
import KPICard from '@/components/dashboard/KPICard'

export default function DashboardPage() {
  const [month, setMonth] = useState(getMonthKey())
  const [kpi, setKpi] = useState<KPIResult | null>(null)
  const [sales, setSales] = useState<DailySales[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [kpiRes, salesRes] = await Promise.all([
        fetch(`/api/integrations/kpi?month=${month}`),
        fetch(`/api/sales?month=${month}`),
      ])
      setKpi(await kpiRes.json())
      setSales(await salesRes.json())
      setLoading(false)
    }
    load()
  }, [month])

  const today = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>ภาพรวม</h1>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{today}</p>
        </div>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5"
          style={{ borderColor: 'var(--border)', background: 'white' }}>
          {Array.from({ length: 6 }, (_, i) => {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
            return <option key={key} value={key}>{formatThaiMonth(key)}</option>
          })}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : kpi ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3">
            <KPICard label="รายได้สุทธิ" value={formatBaht(kpi.totalRevenueSatang)} icon="💰"
              sub={kpi.revenueAchievementBps > 0 ? `${formatPct(kpi.revenueAchievementBps)} ของเป้า` : undefined} color="red" />
            <KPICard label="กำไรสุทธิ" value={formatBaht(kpi.netProfitSatang)}
              sub={formatPct(kpi.netProfitBps)} icon="📈"
              color={kpi.netProfitBps >= 1000 ? 'green' : kpi.netProfitBps >= 0 ? 'yellow' : 'red'} />
            <KPICard label="Food Cost" value={formatPct(kpi.foodCostBps)} icon="🍖"
              sub={kpi.foodCostSource === 'kintsu_stock' ? '← KINTSU Stock' : 'กรอกเอง'}
              color={kpi.foodCostBps <= 3500 ? 'green' : 'red'} />
            <KPICard label="Labor Cost" value={formatPct(kpi.laborCostBps)} icon="👥"
              sub={kpi.laborCostSource === 'kintsu_hr' ? '← KINTSU HR' : 'กรอกเอง'}
              color={kpi.laborCostBps <= 3000 ? 'green' : 'yellow'} />
            <KPICard label="VAT ต้องชำระ" value={formatBaht(kpi.vatPayableSatang)} icon="🧾" color="stone" />
            <KPICard label="Grab GP Cost" value={formatBaht(kpi.grabGpCostSatang)}
              sub={formatPct(kpi.foodCostBps > 0 ? Math.round((kpi.grabGpCostSatang / kpi.totalRevenueSatang) * 10000) : 0)}
              icon="🛵" color="stone" />
          </div>

          {/* Integration badges */}
          {(kpi.foodCostSource === 'kintsu_stock' || kpi.laborCostSource === 'kintsu_hr') && (
            <div className="flex gap-2 flex-wrap">
              {kpi.foodCostSource === 'kintsu_stock' && (
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                  ✅ Food Cost จาก KINTSU Stock
                </span>
              )}
              {kpi.laborCostSource === 'kintsu_hr' && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                  ✅ Labor Cost จาก KINTSU HR
                </span>
              )}
            </div>
          )}

          {/* P&L Breakdown */}
          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--charcoal)' }}>สรุป P&L</h3>
            <div className="space-y-2 text-sm">
              <PnLRow label="รายได้สุทธิ" value={kpi.totalRevenueSatang} bold />
              <PnLRow label="Food Cost" value={-kpi.foodCostSatang} indent />
              <PnLRow label="Labor Cost" value={-kpi.laborCostSatang} indent />
              <PnLRow label="Grab GP" value={-kpi.grabGpCostSatang} indent />
              <PnLRow label="ค่าใช้จ่ายอื่นๆ" value={-kpi.otherExpensesSatang} indent />
              <div className="border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}>
                <PnLRow label="กำไรสุทธิ" value={kpi.netProfitSatang} bold
                  highlight={kpi.netProfitSatang >= 0 ? 'green' : 'red'} />
              </div>
            </div>
          </div>

          {/* Revenue Chart */}
          {sales.length > 0 && <RevenueChart sales={sales} />}
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">ไม่มีข้อมูล</div>
      )}
    </div>
  )
}

function PnLRow({ label, value, bold, indent, highlight }: {
  label: string; value: number; bold?: boolean; indent?: boolean; highlight?: 'green' | 'red'
}) {
  const textColor = highlight === 'green' ? '#065F46' : highlight === 'red' ? '#991B1B' : 'var(--charcoal)'
  return (
    <div className={`flex justify-between ${indent ? 'pl-4' : ''}`}>
      <span className={bold ? 'font-semibold' : ''} style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <span className={bold ? 'font-semibold' : ''} style={{ color: textColor }}>
        {value >= 0 ? formatBaht(value) : `(${formatBaht(Math.abs(value))})`}
      </span>
    </div>
  )
}
