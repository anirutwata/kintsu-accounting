'use client'
import { useState, useEffect } from 'react'
import { formatBaht, formatPct } from '@/lib/money'
import { getMonthKey, formatThaiMonth, getTodayBKK } from '@/lib/utils'
import type { KPIResult, DailySales } from '@/types'
import RevenueChart from '@/components/dashboard/RevenueChart'
import KPICard from '@/components/dashboard/KPICard'

type ViewMode = 'monthly' | 'daily' | 'range'

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [month, setMonth] = useState(getMonthKey())
  const [selectedDate, setSelectedDate] = useState(getTodayBKK())
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  })
  const [rangeTo, setRangeTo] = useState(getTodayBKK())
  const [kpi, setKpi] = useState<KPIResult | null>(null)
  const [sales, setSales] = useState<DailySales[]>([])
  const [dailySale, setDailySale] = useState<DailySales | null>(null)
  const [rangeSales, setRangeSales] = useState<DailySales[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (viewMode === 'monthly') loadMonthly()
    else if (viewMode === 'daily') loadDaily()
    else loadRange()
  }, [viewMode, month, selectedDate, rangeFrom, rangeTo])

  async function loadMonthly() {
    setLoading(true)
    const [kpiRes, salesRes] = await Promise.all([
      fetch(`/api/integrations/kpi?month=${month}`),
      fetch(`/api/sales?month=${month}`),
    ])
    setKpi(await kpiRes.json())
    setSales(await salesRes.json())
    setLoading(false)
  }

  async function loadDaily() {
    setLoading(true)
    const res = await fetch(`/api/sales?date=${selectedDate}`)
    const data = await res.json()
    setDailySale(Array.isArray(data) && data.length > 0 ? data[0] : null)
    setLoading(false)
  }

  async function loadRange() {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return
    setLoading(true)
    const res = await fetch(`/api/sales?from=${rangeFrom}&to=${rangeTo}`)
    const data = await res.json()
    setRangeSales(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  const todayLabel = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const MODES: { key: ViewMode; label: string }[] = [
    { key: 'monthly', label: 'รายเดือน' },
    { key: 'daily', label: 'รายวัน' },
    { key: 'range', label: 'ช่วงวัน' },
  ]

  return (
    <div className="space-y-4 py-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>ภาพรวม</h1>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{todayLabel}</p>
          </div>
        </div>
        {/* View mode toggle */}
        <div className="flex rounded-lg overflow-hidden border text-sm w-full" style={{ borderColor: 'var(--border)' }}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => setViewMode(m.key)}
              className="flex-1 py-2 font-medium transition-colors"
              style={{ background: viewMode === m.key ? 'var(--flame-red)' : 'white', color: viewMode === m.key ? 'white' : 'var(--charcoal)' }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      {viewMode === 'range' ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted-foreground)' }}>ตั้งแต่วันที่</label>
            <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
              className="w-full text-sm border rounded-lg px-3 py-2"
              style={{ borderColor: 'var(--border)', background: 'white' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted-foreground)' }}>ถึงวันที่</label>
            <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
              className="w-full text-sm border rounded-lg px-3 py-2"
              style={{ borderColor: 'var(--border)', background: 'white' }} />
          </div>
        </div>
      ) : viewMode === 'monthly' ? (
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="w-full text-sm border rounded-lg px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'white' }}>
          {Array.from({ length: 6 }, (_, i) => {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
            return <option key={key} value={key}>{formatThaiMonth(key)}</option>
          })}
        </select>
      ) : (
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="w-full text-sm border rounded-lg px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'white' }} />
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : viewMode === 'daily' ? (
        <DailyView sale={dailySale} date={selectedDate} />
      ) : viewMode === 'range' ? (
        <RangeView sales={rangeSales} from={rangeFrom} to={rangeTo} />
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

function DailyView({ sale, date }: { sale: DailySales | null; date: string }) {
  if (!sale) {
    return (
      <div className="bg-white rounded-2xl p-8 border text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-gray-400 text-sm">ยังไม่มีข้อมูลรายรับวันที่ {date}</p>
      </div>
    )
  }

  const rows = [
    { label: 'Foodstory POS', value: sale.dine_in_revenue_satang, icon: '🍽️', bills: sale.dine_in_bills },
    { label: 'Papaya POS', value: sale.papaya_revenue_satang, icon: '🧾', bills: sale.papaya_bills },
    { label: 'GrabFood (gross)', value: sale.grabfood_gross_satang, sub: `GP fee: (${formatBaht(sale.grabfood_gp_fee_satang)})`, icon: '🛵' },
    { label: 'Takeaway', value: sale.takeaway_revenue_satang, icon: '🥡', orders: sale.takeaway_orders },
  ]

  const payments = [
    { label: 'เงินสด', value: (sale.cash_satang || 0) + (sale.papaya_cash_satang || 0) },
    { label: 'พร้อมเพย์', value: (sale.promptpay_satang || 0) + (sale.papaya_promptpay_satang || 0) },
    { label: 'โอน (บริษัท)', value: (sale.company_transfer_satang || 0) + (sale.papaya_company_transfer_satang || 0) },
    { label: 'บัตรเครดิต', value: (sale.credit_card_satang || 0) + (sale.papaya_credit_card_satang || 0) },
  ].filter(p => p.value > 0)

  return (
    <div className="space-y-3">
      {/* Total */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--flame-red)' }}>
        <p className="text-sm text-white/80">รายได้สุทธิรวม</p>
        <p className="text-3xl font-bold text-white mt-1">{formatBaht(sale.total_net_satang)}</p>
        {sale.total_gross_satang !== sale.total_net_satang && (
          <p className="text-xs text-white/70 mt-1">Gross: {formatBaht(sale.total_gross_satang)}</p>
        )}
      </div>

      {/* Channel breakdown */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold px-4 py-3 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--border)' }}>
          แหล่งรายรับ
        </p>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map(r => r.value > 0 && (
            <div key={r.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{r.icon} {r.label}</p>
                {r.bills !== undefined && r.bills > 0 && (
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{r.bills} บิล</p>
                )}
                {r.orders !== undefined && r.orders > 0 && (
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{r.orders} order</p>
                )}
                {r.sub && <p className="text-xs text-red-500">{r.sub}</p>}
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{formatBaht(r.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Payment channels */}
      {payments.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold px-4 py-3 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--border)' }}>
            ช่องทางชำระเงิน
          </p>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {payments.map(p => (
              <div key={p.label} className="flex justify-between px-4 py-2.5 text-sm">
                <span style={{ color: 'var(--muted-foreground)' }}>{p.label}</span>
                <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatBaht(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VAT */}
      {sale.total_vat_satang > 0 && (
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--muted-foreground)' }}>VAT รวม</span>
            <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatBaht(sale.total_vat_satang)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function RangeView({ sales, from, to }: { sales: DailySales[]; from: string; to: string }) {
  if (!from || !to) return null
  if (sales.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 border text-center" style={{ borderColor: 'var(--border)' }}>
        <p className="text-gray-400 text-sm">ไม่มีข้อมูลในช่วงที่เลือก</p>
      </div>
    )
  }

  const sum = (key: keyof DailySales) => sales.reduce((a, s) => a + ((s[key] as number) || 0), 0)

  const totalNet = sum('total_net_satang')
  const totalGross = sum('total_gross_satang')
  const foodstoryRev = sum('dine_in_revenue_satang')
  const papayaRev = sum('papaya_revenue_satang')
  const grabGross = sum('grabfood_gross_satang')
  const grabGpFee = sum('grabfood_gp_fee_satang')
  const takeaway = sum('takeaway_revenue_satang')
  const totalBills = sum('dine_in_bills') + sum('papaya_bills')
  const totalOrders = sum('grabfood_orders') + sum('takeaway_orders')
  const totalVat = sum('total_vat_satang')

  const channels = [
    { label: 'เงินสด', value: sum('cash_satang') + sum('papaya_cash_satang') },
    { label: 'พร้อมเพย์', value: sum('promptpay_satang') + sum('papaya_promptpay_satang') },
    { label: 'โอน (บริษัท)', value: sum('company_transfer_satang') + sum('papaya_company_transfer_satang') },
    { label: 'บัตรเครดิต', value: sum('credit_card_satang') + sum('papaya_credit_card_satang') },
  ].filter(p => p.value > 0)

  const rows = [
    { label: 'Foodstory POS', value: foodstoryRev, icon: '🍽️' },
    { label: 'Papaya POS', value: papayaRev, icon: '🧾' },
    { label: 'GrabFood (gross)', value: grabGross, sub: `GP fee: (${formatBaht(grabGpFee)})`, icon: '🛵' },
    { label: 'Takeaway', value: takeaway, icon: '🥡' },
  ].filter(r => r.value > 0)

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4" style={{ background: 'var(--flame-red)' }}>
        <p className="text-sm text-white/80">รายได้สุทธิรวม ({sales.length} วัน)</p>
        <p className="text-3xl font-bold text-white mt-1">{formatBaht(totalNet)}</p>
        {totalGross !== totalNet && (
          <p className="text-xs text-white/70 mt-1">Gross: {formatBaht(totalGross)}</p>
        )}
        {(totalBills > 0 || totalOrders > 0) && (
          <p className="text-xs text-white/70 mt-0.5">
            {totalBills > 0 ? `${totalBills} บิล` : ''}{totalBills > 0 && totalOrders > 0 ? ' · ' : ''}{totalOrders > 0 ? `${totalOrders} order` : ''}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold px-4 py-3 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--border)' }}>แหล่งรายรับ</p>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map(r => (
            <div key={r.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{r.icon} {r.label}</p>
                {r.sub && <p className="text-xs text-red-500">{r.sub}</p>}
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{formatBaht(r.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {channels.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold px-4 py-3 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--border)' }}>ช่องทางชำระเงิน</p>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {channels.map(p => (
              <div key={p.label} className="flex justify-between px-4 py-2.5 text-sm">
                <span style={{ color: 'var(--muted-foreground)' }}>{p.label}</span>
                <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatBaht(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalVat > 0 && (
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--muted-foreground)' }}>VAT รวม</span>
            <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatBaht(totalVat)}</span>
          </div>
        </div>
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
