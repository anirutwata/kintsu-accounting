'use client'
import { useState, useEffect } from 'react'
import { formatBaht, formatPct } from '@/lib/money'
import { getMonthKey, formatThaiMonth } from '@/lib/utils'
import type { KPIResult } from '@/types'

export default function ReportsPage() {
  const [month, setMonth] = useState(getMonthKey())
  const [kpi, setKpi] = useState<KPIResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/integrations/kpi?month=${month}`)
      setKpi(await res.json())
      setLoading(false)
    }
    load()
  }, [month])

  async function sendTelegramSummary() {
    if (!kpi) return
    setSending(true)
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'daily_summary',
        data: {
          date: formatThaiMonth(month),
          totalRevenue: kpi.totalRevenueSatang,
          foodCostBps: kpi.foodCostBps,
          laborCostBps: kpi.laborCostBps,
          netProfitSatang: kpi.netProfitSatang,
          netProfitBps: kpi.netProfitBps,
          overdueSuppliers: 0,
        },
      }),
    })
    setSending(false)
    alert('ส่ง Telegram แล้ว!')
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>รายงาน P&L</h1>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5" style={{ borderColor: 'var(--border)', background: 'white' }}>
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
            return <option key={key} value={key}>{formatThaiMonth(key)}</option>
          })}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : kpi ? (
        <>
          {/* P&L Table */}
          <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              <h3 className="font-semibold text-sm">งบกำไร-ขาดทุน — {formatThaiMonth(month)}</h3>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              <PLRow label="รายได้สุทธิ" value={kpi.totalRevenueSatang} type="income" />
              <PLRow label="Food Cost" pct={kpi.foodCostBps} value={-kpi.foodCostSatang} type="expense"
                badge={kpi.foodCostSource === 'kintsu_stock' ? 'Stock' : undefined} />
              <PLRow label="Labor Cost" pct={kpi.laborCostBps} value={-kpi.laborCostSatang} type="expense"
                badge={kpi.laborCostSource === 'kintsu_hr' ? 'HR' : undefined} />
              <PLRow label="Grab GP Fee" value={-kpi.grabGpCostSatang} type="expense" />
              <PLRow label="ค่าใช้จ่ายอื่นๆ" value={-kpi.otherExpensesSatang} type="expense" />
              <PLRow label="รวมค่าใช้จ่าย" value={-kpi.totalExpensesSatang} type="subtotal" />
              <PLRow label="กำไรสุทธิ" pct={kpi.netProfitBps} value={kpi.netProfitSatang}
                type={kpi.netProfitSatang >= 0 ? 'profit' : 'loss'} />
            </div>
          </div>

          {/* VAT Section */}
          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--charcoal)' }}>ภาษีมูลค่าเพิ่ม</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted-foreground)' }}>VAT รับ (จากลูกค้า)</span>
                <span>{formatBaht(kpi.vatPayableSatang > 0 ? kpi.vatPayableSatang : 0)}</span>
              </div>
              <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex justify-between font-semibold">
                  <span>VAT ต้องนำส่ง</span>
                  <span style={{ color: kpi.vatPayableSatang > 0 ? '#991B1B' : '#065F46' }}>
                    {formatBaht(Math.max(0, kpi.vatPayableSatang))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Target vs Actual */}
          {(kpi.foodCostVarianceBps !== 0 || kpi.netProfitVarianceBps !== 0) && (
            <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--charcoal)' }}>เป้าหมาย vs จริง</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted-foreground)' }}>Food Cost Variance</span>
                  <span className={kpi.foodCostVarianceBps >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {kpi.foodCostVarianceBps >= 0 ? '+' : ''}{formatPct(kpi.foodCostVarianceBps)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted-foreground)' }}>Net Profit Variance</span>
                  <span className={kpi.netProfitVarianceBps >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {kpi.netProfitVarianceBps >= 0 ? '+' : ''}{formatPct(kpi.netProfitVarianceBps)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Send Telegram */}
          <button onClick={sendTelegramSummary} disabled={sending}
            className="w-full py-3 rounded-2xl font-semibold border-2 transition-colors disabled:opacity-60"
            style={{ borderColor: 'var(--flame-red)', color: 'var(--flame-red)' }}>
            {sending ? 'กำลังส่ง...' : '📲 ส่งสรุปไป Telegram'}
          </button>
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">ไม่มีข้อมูล</div>
      )}
    </div>
  )
}

function PLRow({ label, value, pct, type, badge }: {
  label: string; value: number; pct?: number; type: 'income'|'expense'|'subtotal'|'profit'|'loss'; badge?: string
}) {
  const textColor = type === 'profit' ? '#065F46' : type === 'loss' ? '#991B1B' : 'var(--charcoal)'
  const bg = (type === 'subtotal' || type === 'profit' || type === 'loss') ? 'var(--muted)' : 'white'
  const bold = type !== 'expense'

  return (
    <div className="flex justify-between items-center px-4 py-3" style={{ background: bg }}>
      <div className="flex items-center gap-2">
        <span className={bold ? 'font-semibold text-sm' : 'text-sm'} style={{ color: 'var(--muted-foreground)' }}>
          {label}
        </span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{badge}</span>
        )}
      </div>
      <div className="text-right">
        <span className={bold ? 'font-semibold text-sm' : 'text-sm'} style={{ color: textColor }}>
          {value < 0 ? `(${formatBaht(Math.abs(value))})` : formatBaht(value)}
        </span>
        {pct !== undefined && (
          <span className="text-xs ml-1" style={{ color: 'var(--muted-foreground)' }}>
            {formatPct(pct)}
          </span>
        )}
      </div>
    </div>
  )
}
