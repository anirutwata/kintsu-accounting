'use client'
import { useState, useEffect } from 'react'

interface JournalEntry {
  id: string
  date: string
  type: 'expense' | 'sales' | 'transfer' | 'asset'
  description: string
  ref: string
  debit_code: string
  debit_name: string
  credit_code: string
  credit_name: string
  amount: number
}

interface JournalResult {
  entries: JournalEntry[]
  totalIn: number
  totalOut: number
  count: number
}

function fmtBaht(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateFull(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })
}

function getMonthOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ value, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) })
  }
  return opts
}

const TYPE_CONFIG = {
  expense:  { label: 'รายจ่าย',   bg: '#fef2f2', color: '#991b1b', icon: '🧾' },
  sales:    { label: 'รายรับ',    bg: '#f0fdf4', color: '#166534', icon: '💰' },
  transfer: { label: 'โอนเงิน',  bg: '#eff6ff', color: '#1d4ed8', icon: '🔄' },
  asset:    { label: 'สินทรัพย์', bg: '#f5f3ff', color: '#6d28d9', icon: '🏗️' },
}

const FILTER_TYPES = ['all', 'expense', 'sales', 'transfer', 'asset'] as const

export default function JournalPage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const [month, setMonth] = useState(today.substring(0, 7))
  const [filterType, setFilterType] = useState<typeof FILTER_TYPES[number]>('all')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<JournalResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const monthOptions = getMonthOptions()

  async function load(m: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/journal?month=${m}`)
      const d = await res.json()
      setData(res.ok ? d : null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(month) }, [month])

  const filtered = (data?.entries || []).filter(e => {
    if (filterType !== 'all' && e.type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      return e.description.toLowerCase().includes(q) ||
             e.debit_name.toLowerCase().includes(q) ||
             e.credit_name.toLowerCase().includes(q) ||
             e.debit_code.includes(q) ||
             e.credit_code.includes(q)
    }
    return true
  })

  // Group by date
  const grouped: { date: string; entries: JournalEntry[] }[] = []
  for (const e of filtered) {
    const last = grouped[grouped.length - 1]
    if (last && last.date === e.date) last.entries.push(e)
    else grouped.push({ date: e.date, entries: [e] })
  }

  const netForDate = (entries: JournalEntry[]) => {
    const income = entries.filter(e => e.type === 'sales').reduce((s, e) => s + e.amount, 0)
    const expense = entries.filter(e => e.type === 'expense' || e.type === 'asset').reduce((s, e) => s + e.amount, 0)
    return income - expense
  }

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>สมุดรายวัน</h1>

      {/* Month selector */}
      <select value={month} onChange={e => setMonth(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm font-medium"
        style={{ borderColor: 'var(--border)', color: 'var(--charcoal)' }}>
        {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>รายรับ</p>
            <p className="text-sm font-bold" style={{ color: '#16a34a' }}>฿{fmtBaht(data.totalIn)}</p>
          </div>
          <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>รายจ่าย</p>
            <p className="text-sm font-bold" style={{ color: '#dc2626' }}>฿{fmtBaht(data.totalOut)}</p>
          </div>
          <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>กำไรสุทธิ</p>
            <p className="text-sm font-bold" style={{ color: data.totalIn - data.totalOut >= 0 ? '#16a34a' : '#dc2626' }}>
              ฿{fmtBaht(data.totalIn - data.totalOut)}
            </p>
          </div>
        </div>
      )}

      {/* Filter + Search */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {FILTER_TYPES.map(t => {
            const cfg = t === 'all' ? null : TYPE_CONFIG[t]
            return (
              <button key={t} onClick={() => setFilterType(t)}
                className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                style={{
                  background: filterType === t ? 'var(--flame-red)' : '#f3f4f6',
                  color: filterType === t ? 'white' : 'var(--muted-foreground)',
                }}>
                {t === 'all' ? 'ทั้งหมด' : `${cfg!.icon} ${cfg!.label}`}
              </button>
            )
          })}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหารายการ หรือรหัสบัญชี..."
          className="w-full border rounded-xl px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }} />
      </div>

      {/* Count */}
      {!loading && data && (
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          แสดง {filtered.length} จาก {data.count} รายการ
        </p>
      )}

      {/* Journal list */}
      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <span className="animate-spin inline-block mr-1">⏳</span> กำลังโหลด...
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>ไม่มีรายการ</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ date, entries }) => {
            const net = netForDate(entries)
            return (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{fmtDateFull(date)}</span>
                  <span className="text-xs font-semibold"
                    style={{ color: net >= 0 ? '#16a34a' : '#dc2626' }}>
                    {net >= 0 ? '+' : ''}฿{fmtBaht(net)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {entries.map(e => {
                    const cfg = TYPE_CONFIG[e.type]
                    const isExpanded = expandedId === e.id
                    const isOut = e.type === 'expense' || e.type === 'asset'
                    return (
                      <div key={e.id}
                        className="bg-white rounded-2xl border overflow-hidden cursor-pointer"
                        style={{ borderColor: 'var(--border)', borderLeft: `4px solid ${cfg.color}` }}
                        onClick={() => setExpandedId(isExpanded ? null : e.id)}>
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Type badge */}
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: cfg.bg, color: cfg.color }}>
                                  {cfg.icon} {cfg.label}
                                </span>
                              </div>
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
                                {e.description}
                              </p>
                              {/* Dr / Cr summary line */}
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                                Dr. {e.debit_code} · Cr. {e.credit_code}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold"
                                style={{ color: isOut ? '#dc2626' : e.type === 'transfer' ? '#1d4ed8' : '#16a34a' }}>
                                {isOut ? '-' : e.type === 'transfer' ? '' : '+'}฿{fmtBaht(e.amount)}
                              </p>
                              <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                                {isExpanded ? '▲' : '▼'}
                              </p>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="mt-2 pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
                              {e.ref && (
                                <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                                  📋 {e.ref}
                                </p>
                              )}
                              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                                <div className="grid grid-cols-3 text-[10px] font-bold px-2 py-1"
                                  style={{ background: '#f9fafb', color: '#6b7280' }}>
                                  <span>บัญชี</span>
                                  <span className="text-center">เดบิต</span>
                                  <span className="text-right">เครดิต</span>
                                </div>
                                <div className="grid grid-cols-3 text-[11px] px-2 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                                  <span className="text-[10px]" style={{ color: 'var(--charcoal)' }}>
                                    {e.debit_code} {e.debit_name}
                                  </span>
                                  <span className="text-center font-semibold" style={{ color: '#1d4ed8' }}>
                                    {fmtBaht(e.amount)}
                                  </span>
                                  <span className="text-right text-[10px]" style={{ color: '#9ca3af' }}>—</span>
                                </div>
                                <div className="grid grid-cols-3 text-[11px] px-2 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                                  <span className="text-[10px] pl-3" style={{ color: 'var(--charcoal)' }}>
                                    {e.credit_code} {e.credit_name}
                                  </span>
                                  <span className="text-center text-[10px]" style={{ color: '#9ca3af' }}>—</span>
                                  <span className="text-right font-semibold" style={{ color: '#dc2626' }}>
                                    {fmtBaht(e.amount)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
