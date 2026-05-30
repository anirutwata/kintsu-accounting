'use client'
import { useState, useEffect } from 'react'
import { formatBaht, toSatang } from '@/lib/money'
import { formatThaiMonth } from '@/lib/utils'
import type { MonthlyTarget } from '@/types'

function getMonthOptions() {
  const months = []
  for (let i = -3; i <= 2; i++) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + i)
    months.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7))
  }
  return months.sort((a, b) => b.localeCompare(a))
}

interface FormState {
  revenue: string
  food_cost_pct: string
  labor_cost_pct: string
  net_profit_pct: string
}

const emptyForm = (): FormState => ({ revenue: '', food_cost_pct: '', labor_cost_pct: '', net_profit_pct: '' })

export default function TargetsPage() {
  const [targets, setTargets] = useState<MonthlyTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(getMonthOptions()[3]) // current month
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const months = getMonthOptions()

  useEffect(() => { load() }, [])

  useEffect(() => {
    const existing = targets.find(t => t.id === selectedMonth)
    if (existing) {
      setForm({
        revenue: existing.revenue_target_satang ? String(existing.revenue_target_satang / 100) : '',
        food_cost_pct: existing.food_cost_target_bps ? String(existing.food_cost_target_bps / 100) : '',
        labor_cost_pct: existing.labor_cost_target_bps ? String(existing.labor_cost_target_bps / 100) : '',
        net_profit_pct: existing.net_profit_target_bps ? String(existing.net_profit_target_bps / 100) : '',
      })
    } else {
      setForm(emptyForm())
    }
    setSaved(false)
  }, [selectedMonth, targets])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/targets')
    setTargets(await res.json())
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: selectedMonth,
        revenue_target_satang: toSatang(parseFloat(form.revenue) || 0),
        food_cost_target_bps: Math.round((parseFloat(form.food_cost_pct) || 0) * 100),
        labor_cost_target_bps: Math.round((parseFloat(form.labor_cost_pct) || 0) * 100),
        net_profit_target_bps: Math.round((parseFloat(form.net_profit_pct) || 0) * 100),
      }),
    })
    setSaving(false)
    setSaved(true)
    load()
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>เป้าหมายรายเดือน</h1>

      {/* Month selector */}
      <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
        className="w-full text-sm border rounded-xl px-3 py-2"
        style={{ borderColor: 'var(--border)', background: 'white' }}>
        {months.map(m => (
          <option key={m} value={m}>
            {formatThaiMonth(m)}{targets.find(t => t.id === m) ? ' ✓' : ''}
          </option>
        ))}
      </select>

      {saved && (
        <div className="p-3 rounded-xl bg-green-50 text-green-700 text-sm">✅ บันทึกเป้าหมายแล้ว</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl border p-4 space-y-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>
              เป้ารายได้สุทธิ (บาท)
            </label>
            <input type="number" min="0" step="1" value={form.revenue} onChange={set('revenue')}
              className="w-full border rounded-xl px-3 py-2 text-sm text-right"
              style={{ borderColor: 'var(--border)' }} placeholder="0" />
            {form.revenue && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                = {formatBaht(toSatang(parseFloat(form.revenue)))}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'food_cost_pct' as const, label: 'Food Cost %', color: '#D33F22' },
              { key: 'labor_cost_pct' as const, label: 'Labor Cost %', color: '#2563EB' },
              { key: 'net_profit_pct' as const, label: 'Net Profit %', color: '#16A34A' },
            ].map(({ key, label, color }) => (
              <div key={key}>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
                <div className="relative">
                  <input type="number" min="0" max="100" step="0.1" value={form[key]} onChange={set(key)}
                    className="w-full border rounded-xl px-3 py-2 text-sm text-right pr-7"
                    style={{ borderColor: 'var(--border)' }} placeholder="0" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color }}>%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Existing targets overview */}
        {!loading && targets.length > 0 && (
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold px-4 py-3 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--border)' }}>
              เป้าหมายที่ตั้งไว้
            </p>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {targets.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5 cursor-pointer"
                  onClick={() => setSelectedMonth(t.id)}
                  style={{ background: t.id === selectedMonth ? 'var(--muted)' : 'white' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{formatThaiMonth(t.id)}</span>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {formatBaht(t.revenue_target_satang)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--flame-red)' }}>
          {saving ? 'กำลังบันทึก...' : `บันทึกเป้าหมาย ${formatThaiMonth(selectedMonth)}`}
        </button>
      </form>
    </div>
  )
}
