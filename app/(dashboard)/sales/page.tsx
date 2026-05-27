'use client'
import { useState, useEffect } from 'react'
import { formatBaht, toSatang, calculateVAT, calcGrabNet } from '@/lib/money'
import { getTodayBKK } from '@/lib/utils'
import type { DailySales } from '@/types'

export default function SalesPage() {
  const [date, setDate] = useState(getTodayBKK())
  const [existing, setExisting] = useState<DailySales | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    dine_in_revenue: '', dine_in_covers: '',
    grabfood_gross: '',
    takeaway_revenue: '', takeaway_orders: '',
  })

  useEffect(() => { loadSales() }, [date])

  async function loadSales() {
    const res = await fetch(`/api/sales?date=${date}`)
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const s = data[0] as DailySales
      setExisting(s)
      setForm({
        dine_in_revenue: String(s.dine_in_revenue_satang / 100),
        dine_in_covers: String(s.dine_in_covers),
        grabfood_gross: String(s.grabfood_gross_satang / 100),
        takeaway_revenue: String(s.takeaway_revenue_satang / 100),
        takeaway_orders: String(s.takeaway_orders),
      })
    } else {
      setExisting(null)
      setForm({ dine_in_revenue: '', dine_in_covers: '', grabfood_gross: '', takeaway_revenue: '', takeaway_orders: '' })
    }
    setSaved(false)
  }

  const dineRev = toSatang(parseFloat(form.dine_in_revenue) || 0)
  const grabGross = toSatang(parseFloat(form.grabfood_gross) || 0)
  const takeawayRev = toSatang(parseFloat(form.takeaway_revenue) || 0)

  const dineVat = calculateVAT(dineRev)
  const { gpFeeSatang, netSatang: grabNet } = calcGrabNet(grabGross)
  const totalNet = dineRev + grabNet + takeawayRev

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          dine_in: {
            revenue_satang: dineRev,
            covers: parseInt(form.dine_in_covers) || 0,
            service_charge_satang: dineVat.serviceChargeSatang,
            vat_satang: dineVat.vatSatang,
          },
          grabfood: { gross_satang: grabGross, orders: 0, vat_satang: 0 },
          takeaway: { revenue_satang: takeawayRev, orders: parseInt(form.takeaway_orders) || 0, vat_satang: 0 },
        }),
      })
      if (res.ok) { setSaved(true); loadSales() }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>บันทึกรายรับ</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5" style={{ borderColor: 'var(--border)' }} />
      </div>

      {saved && (
        <div className="p-3 rounded-xl bg-green-50 text-green-700 text-sm font-medium">
          ✅ บันทึกแล้ว
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dine-in */}
        <SalesSection title="หน้าร้าน (Dine-in)" icon="🍽️" color="#D33F22">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>ยอดขาย (บาท)</label>
              <input type="number" step="1" min="0" value={form.dine_in_revenue}
                onChange={e => setForm(f => ({ ...f, dine_in_revenue: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>จำนวน cover</label>
              <input type="number" min="0" value={form.dine_in_covers}
                onChange={e => setForm(f => ({ ...f, dine_in_covers: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
          </div>
          {dineRev > 0 && (
            <div className="mt-2 p-2 rounded-lg text-xs space-y-1" style={{ background: 'var(--muted)' }}>
              <p style={{ color: 'var(--muted-foreground)' }}>SC 10%: {formatBaht(dineVat.serviceChargeSatang)}</p>
              <p style={{ color: 'var(--muted-foreground)' }}>VAT 7%: {formatBaht(dineVat.vatSatang)}</p>
            </div>
          )}
        </SalesSection>

        {/* GrabFood */}
        <SalesSection title="GrabFood Delivery" icon="🛵" color="#9F8966">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>ยอดขาย Gross (บาท)</label>
            <input type="number" step="1" min="0" value={form.grabfood_gross}
              onChange={e => setForm(f => ({ ...f, grabfood_gross: e.target.value }))}
              className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
              style={{ borderColor: 'var(--border)' }} placeholder="0" />
          </div>
          {grabGross > 0 && (
            <div className="mt-2 p-2 rounded-lg text-xs space-y-1" style={{ background: 'var(--muted)' }}>
              <p className="text-red-600">Grab GP -30%: ({formatBaht(gpFeeSatang)})</p>
              <p className="font-medium" style={{ color: 'var(--charcoal)' }}>ยอดสุทธิ: {formatBaht(grabNet)}</p>
            </div>
          )}
        </SalesSection>

        {/* Takeaway */}
        <SalesSection title="กลับบ้าน (Takeaway)" icon="🥡" color="#9D1F14">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>ยอดขาย (บาท)</label>
              <input type="number" step="1" min="0" value={form.takeaway_revenue}
                onChange={e => setForm(f => ({ ...f, takeaway_revenue: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>จำนวน order</label>
              <input type="number" min="0" value={form.takeaway_orders}
                onChange={e => setForm(f => ({ ...f, takeaway_orders: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
          </div>
        </SalesSection>

        {/* Total */}
        {totalNet > 0 && (
          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>รายได้สุทธิรวม</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--flame-red)' }}>{formatBaht(totalNet)}</p>
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--flame-red)' }}>
          {loading ? 'กำลังบันทึก...' : existing ? 'อัปเดตรายรับ' : 'บันทึกรายรับ'}
        </button>
      </form>
    </div>
  )
}

function SalesSection({ title, icon, color, children }: {
  title: string; icon: string; color: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-base"
          style={{ background: color }}>
          {icon}
        </div>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}
