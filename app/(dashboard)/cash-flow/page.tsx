'use client'
import { useState, useEffect } from 'react'

interface CashLine { code: string; name: string; amount: number }

function getMonths() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    months.push({ val, label })
  }
  return months
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isCash(code: string) { return code.startsWith('11') }

function accum(map: Map<string, { name: string; amt: number }>, code: string, name: string, amount: number) {
  const cur = map.get(code) || { name, amt: 0 }
  map.set(code, { name, amt: cur.amt + amount })
}

function toLines(m: Map<string, { name: string; amt: number }>): CashLine[] {
  return [...m.entries()]
    .map(([code, { name, amt }]) => ({ code, name, amount: amt }))
    .filter(l => l.amount > 0.005)
    .sort((a, b) => a.code.localeCompare(b.code))
}

interface SectionData { in: CashLine[]; out: CashLine[] }

function SectionCard({
  title, data, color, bg, border,
}: { title: string; data: SectionData; color: string; bg: string; border: string }) {
  const totalIn  = data.in.reduce((s, l) => s + l.amount, 0)
  const totalOut = data.out.reduce((s, l) => s + l.amount, 0)
  const net = totalIn - totalOut
  const isEmpty = data.in.length === 0 && data.out.length === 0
  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="px-4 py-2.5 border-b font-semibold text-xs flex justify-between"
        style={{ background: bg, borderColor: border, color }}>
        <span>{title}</span>
        <span style={{ color: net < 0 ? '#dc2626' : color }}>
          {net >= 0 ? '+' : '-'}฿{fmt(net)}
        </span>
      </div>
      {isEmpty ? (
        <p className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>ไม่มีรายการ</p>
      ) : (
        <>
          {data.in.map(l => (
            <div key={'in-' + l.code} className="flex items-center px-4 py-2 border-b text-xs"
              style={{ borderColor: 'var(--border)' }}>
              <span className="w-10 font-mono font-semibold shrink-0" style={{ color }}>{l.code}</span>
              <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
              <span className="font-mono" style={{ color: '#166534' }}>+฿{fmt(l.amount)}</span>
            </div>
          ))}
          {data.out.map(l => (
            <div key={'out-' + l.code} className="flex items-center px-4 py-2 border-b text-xs"
              style={{ borderColor: 'var(--border)' }}>
              <span className="w-10 font-mono font-semibold shrink-0" style={{ color }}>{l.code}</span>
              <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
              <span className="font-mono" style={{ color: '#991b1b' }}>-฿{fmt(l.amount)}</span>
            </div>
          ))}
        </>
      )}
      {!isEmpty && (
        <div className="flex justify-between px-4 py-2 text-xs font-bold"
          style={{ background: bg, borderTop: `1px solid ${border}`, color }}>
          <span>สุทธิ</span>
          <span style={{ color: net < 0 ? '#dc2626' : color }}>{net >= 0 ? '+' : '-'}฿{fmt(net)}</span>
        </div>
      )}
    </div>
  )
}

export default function CashFlowPage() {
  const months = getMonths()
  const [month, setMonth]       = useState(months[0].val)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [operating, setOperating] = useState<SectionData>({ in: [], out: [] })
  const [investing, setInvesting] = useState<SectionData>({ in: [], out: [] })
  const [financing, setFinancing] = useState<SectionData>({ in: [], out: [] })

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/journal?month=${month}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'โหลดไม่สำเร็จ'); return }

      const entries: {
        debit_code: string; debit_name: string
        credit_code: string; credit_name: string
        amount: number
      }[] = data.entries || []

      const maps = {
        operating: { in: new Map<string, { name: string; amt: number }>(), out: new Map<string, { name: string; amt: number }>() },
        investing:  { in: new Map<string, { name: string; amt: number }>(), out: new Map<string, { name: string; amt: number }>() },
        financing:  { in: new Map<string, { name: string; amt: number }>(), out: new Map<string, { name: string; amt: number }>() },
      }

      for (const e of entries) {
        const drCash = isCash(e.debit_code)
        const crCash = isCash(e.credit_code)

        // Skip inter-bank / inter-cash transfers
        if (drCash && crCash) continue

        if (drCash) {
          // Dr.11xx → cash inflow, classify by credit account (the source)
          const c = e.credit_code
          if (c.startsWith('4'))                     accum(maps.operating.in, c, e.credit_name, e.amount)
          else if (c.startsWith('2') || c.startsWith('3')) accum(maps.financing.in, c, e.credit_name, e.amount)
          else                                        accum(maps.investing.in, c, e.credit_name, e.amount)
        }

        if (crCash) {
          // Cr.11xx → cash outflow, classify by debit account (the destination)
          const c = e.debit_code
          if (c.startsWith('5'))                     accum(maps.operating.out, c, e.debit_name, e.amount)
          else if (c.startsWith('2') || c.startsWith('3')) accum(maps.financing.out, c, e.debit_name, e.amount)
          else                                        accum(maps.investing.out, c, e.debit_name, e.amount)
        }
      }

      setOperating({ in: toLines(maps.operating.in), out: toLines(maps.operating.out) })
      setInvesting({ in: toLines(maps.investing.in), out: toLines(maps.investing.out) })
      setFinancing({ in: toLines(maps.financing.in), out: toLines(maps.financing.out) })
    } finally {
      setLoading(false)
    }
  }

  const netOp  = operating.in.reduce((s, l) => s + l.amount, 0)  - operating.out.reduce((s, l) => s + l.amount, 0)
  const netInv = investing.in.reduce((s, l) => s + l.amount, 0)  - investing.out.reduce((s, l) => s + l.amount, 0)
  const netFin = financing.in.reduce((s, l) => s + l.amount, 0)  - financing.out.reduce((s, l) => s + l.amount, 0)
  const netTotal = netOp + netInv + netFin

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>งบกระแสเงินสด</h1>

      <select value={month} onChange={e => setMonth(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}>
        {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
      </select>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
      ) : (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'ดำเนินงาน', net: netOp,  color: '#166534' },
              { label: 'ลงทุน',     net: netInv, color: '#1d4ed8' },
              { label: 'จัดหาเงิน', net: netFin, color: '#6d28d9' },
            ].map(({ label, net, color }) => (
              <div key={label} className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
                <p className="text-xs font-bold" style={{ color: net < 0 ? '#dc2626' : color }}>
                  {net >= 0 ? '+' : ''}฿{net.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </p>
              </div>
            ))}
          </div>

          <SectionCard title="กิจกรรมดำเนินงาน (Operating)"
            data={operating} color="#166534" bg="#f0fdf4" border="#bbf7d0" />

          <SectionCard title="กิจกรรมลงทุน (Investing)"
            data={investing} color="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />

          <SectionCard title="กิจกรรมจัดหาเงิน (Financing)"
            data={financing} color="#6d28d9" bg="#f5f3ff" border="#ddd6fe" />

          {/* Net total */}
          <div className="rounded-2xl border p-4 flex justify-between items-center"
            style={{
              background: netTotal >= 0 ? '#f0fdf4' : '#fef2f2',
              borderColor: netTotal >= 0 ? '#86efac' : '#fca5a5',
            }}>
            <span className="font-bold text-sm" style={{ color: netTotal >= 0 ? '#166534' : '#991b1b' }}>
              กระแสเงินสดสุทธิ
            </span>
            <span className="font-bold text-base" style={{ color: netTotal >= 0 ? '#166534' : '#991b1b' }}>
              {netTotal >= 0 ? '+' : ''}฿{netTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
