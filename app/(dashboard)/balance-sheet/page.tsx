'use client'
import { useState, useEffect } from 'react'

interface AccountLine {
  code: string
  name: string
  balance: number
}

function getMonths() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
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

// Earliest month we have data
const FROM_MONTH = '2026-01'

export default function BalanceSheetPage() {
  const months = getMonths()
  const [toMonth, setToMonth] = useState(months[0].val)
  const [loading, setLoading] = useState(false)
  const [assets, setAssets]       = useState<AccountLine[]>([])
  const [liabilities, setLiabilities] = useState<AccountLine[]>([])
  const [equity, setEquity]       = useState<AccountLine[]>([])
  const [netProfit, setNetProfit] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [toMonth])

  async function load() {
    setLoading(true)
    setError('')
    try {
      // Fetch cumulative data from beginning to selected month
      const res = await fetch(`/api/journal?from=${FROM_MONTH}&to=${toMonth}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'โหลดไม่สำเร็จ'); return }

      const entries: { debit_code: string; debit_name: string; credit_code: string; credit_name: string; amount: number }[] = data.entries || []

      const debitMap  = new Map<string, number>()
      const creditMap = new Map<string, number>()
      const nameMap   = new Map<string, string>()

      for (const e of entries) {
        debitMap.set(e.debit_code,   (debitMap.get(e.debit_code)   || 0) + e.amount)
        creditMap.set(e.credit_code, (creditMap.get(e.credit_code) || 0) + e.amount)
        nameMap.set(e.debit_code,  e.debit_name)
        nameMap.set(e.credit_code, e.credit_name)
      }

      const allCodes = new Set([...debitMap.keys(), ...creditMap.keys()])

      const assetLines: AccountLine[]     = []
      const liabLines: AccountLine[]      = []
      const equityLines: AccountLine[]    = []
      let totalIncome = 0
      let totalExpense = 0

      for (const code of allCodes) {
        const dr = debitMap.get(code)  || 0
        const cr = creditMap.get(code) || 0
        const name = nameMap.get(code) || code

        if (code.startsWith('1')) {
          const bal = dr - cr  // asset: debit-normal
          if (Math.abs(bal) > 0.005) assetLines.push({ code, name, balance: bal })
        } else if (code.startsWith('2')) {
          const bal = cr - dr  // liability: credit-normal
          if (Math.abs(bal) > 0.005) liabLines.push({ code, name, balance: bal })
        } else if (code.startsWith('3')) {
          const bal = cr - dr  // equity: credit-normal
          if (Math.abs(bal) > 0.005) equityLines.push({ code, name, balance: bal })
        } else if (code.startsWith('4')) {
          totalIncome += (cr - dr)
        } else if (code.startsWith('5')) {
          totalExpense += (dr - cr)
        }
      }

      assetLines.sort((a, b)  => a.code.localeCompare(b.code))
      liabLines.sort((a, b)   => a.code.localeCompare(b.code))
      equityLines.sort((a, b) => a.code.localeCompare(b.code))

      setAssets(assetLines)
      setLiabilities(liabLines)
      setEquity(equityLines)
      setNetProfit(totalIncome - totalExpense)
    } finally {
      setLoading(false)
    }
  }

  const totalAssets = assets.reduce((s, l) => s + l.balance, 0)
  const totalLiab   = liabilities.reduce((s, l) => s + l.balance, 0)
  const totalEquity = equity.reduce((s, l) => s + l.balance, 0)
  const totalLE     = totalLiab + totalEquity + netProfit
  const isBalanced  = Math.abs(totalAssets - totalLE) < 1

  const Section = ({ title, items, color, bg, border, total }: {
    title: string; items: AccountLine[]; color: string; bg: string; border: string; total: number
  }) => (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="px-4 py-2.5 border-b font-semibold text-xs flex justify-between"
        style={{ background: bg, borderColor: border, color }}>
        <span>{title}</span>
        <span>฿{fmt(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>ไม่มีรายการ</p>
      ) : items.map(l => (
        <div key={l.code} className="flex items-center px-4 py-2.5 border-b text-xs"
          style={{ borderColor: 'var(--border)' }}>
          <span className="w-10 font-mono font-semibold shrink-0" style={{ color }}>{l.code}</span>
          <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
          <span className="font-mono" style={{ color: l.balance < 0 ? '#dc2626' : color }}>
            {l.balance < 0 ? '-' : ''}฿{fmt(l.balance)}
          </span>
        </div>
      ))}
      <div className="flex justify-between px-4 py-2 text-xs font-bold"
        style={{ background: bg, borderTop: `1px solid ${border}`, color }}>
        <span>รวม{title}</span>
        <span>฿{fmt(total)}</span>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>งบดุล</h1>

      <div>
        <p className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>ณ สิ้นเดือน</p>
        <select value={toMonth} onChange={e => setToMonth(e.target.value)}
          className="w-full border rounded-xl px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}>
          {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
      ) : (
        <>
          {/* Balance check */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>สินทรัพย์รวม</p>
              <p className="text-xs font-bold" style={{ color: '#1d4ed8' }}>฿{totalAssets.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>หนี้สิน+ทุน</p>
              <p className="text-xs font-bold" style={{ color: '#6d28d9' }}>฿{totalLE.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-2xl border p-3 text-center"
              style={{ background: isBalanced ? '#f0fdf4' : '#fef2f2', borderColor: isBalanced ? '#bbf7d0' : '#fecaca' }}>
              <p className="text-[10px] mb-0.5" style={{ color: isBalanced ? '#166534' : '#991b1b' }}>งบดุล</p>
              <p className="text-xs font-bold" style={{ color: isBalanced ? '#166534' : '#991b1b' }}>
                {isBalanced ? '✓ สมดุล' : '✗ ไม่สมดุล'}
              </p>
            </div>
          </div>

          {/* Assets */}
          <Section title="สินทรัพย์" items={assets} total={totalAssets}
            color="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />

          {/* Liabilities */}
          <Section title="หนี้สิน" items={liabilities} total={totalLiab}
            color="#991b1b" bg="#fef2f2" border="#fecaca" />

          {/* Equity */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2.5 border-b font-semibold text-xs flex justify-between"
              style={{ background: '#f5f3ff', borderColor: '#ddd6fe', color: '#6d28d9' }}>
              <span>ส่วนของเจ้าของ</span>
              <span>฿{fmt(totalEquity + netProfit)}</span>
            </div>
            {equity.map(l => (
              <div key={l.code} className="flex items-center px-4 py-2.5 border-b text-xs"
                style={{ borderColor: 'var(--border)' }}>
                <span className="w-10 font-mono font-semibold shrink-0" style={{ color: '#6d28d9' }}>{l.code}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
                <span className="font-mono" style={{ color: '#6d28d9' }}>฿{fmt(l.balance)}</span>
              </div>
            ))}
            {/* Net profit as equity line */}
            <div className="flex items-center px-4 py-2.5 border-b text-xs"
              style={{ borderColor: 'var(--border)', background: netProfit >= 0 ? '#f0fdf4' : '#fef2f2' }}>
              <span className="w-10 font-mono font-semibold shrink-0" style={{ color: netProfit >= 0 ? '#166534' : '#991b1b' }}>P&L</span>
              <span className="flex-1" style={{ color: 'var(--charcoal)' }}>
                {netProfit >= 0 ? 'กำไรสะสมปีปัจจุบัน' : 'ขาดทุนสะสมปีปัจจุบัน'}
              </span>
              <span className="font-mono font-semibold" style={{ color: netProfit >= 0 ? '#166534' : '#991b1b' }}>
                {netProfit < 0 ? '-' : ''}฿{fmt(netProfit)}
              </span>
            </div>
            <div className="flex justify-between px-4 py-2 text-xs font-bold"
              style={{ background: '#f5f3ff', borderTop: '1px solid #ddd6fe', color: '#6d28d9' }}>
              <span>รวมส่วนของเจ้าของ</span>
              <span>฿{fmt(totalEquity + netProfit)}</span>
            </div>
          </div>

          {/* Total L+E */}
          <div className="rounded-2xl border p-4 flex justify-between items-center"
            style={{ background: '#f5f3ff', borderColor: '#a78bfa' }}>
            <span className="font-bold text-sm" style={{ color: '#6d28d9' }}>รวมหนี้สิน + ส่วนของเจ้าของ</span>
            <span className="font-bold text-base" style={{ color: '#6d28d9' }}>฿{fmt(totalLE)}</span>
          </div>
        </>
      )}
    </div>
  )
}
