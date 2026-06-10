'use client'
import { useState, useEffect } from 'react'

interface AccountLine {
  code: string
  name: string
  amount: number  // net amount (income: credit-debit, expense: debit-credit)
}

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

const EXPENSE_GROUPS: { label: string; prefix: string }[] = [
  { label: 'ต้นทุนวัตถุดิบ',       prefix: '51' },
  { label: 'วัสดุ / บรรจุภัณฑ์',   prefix: '52' },
  { label: 'แรงงาน',               prefix: '53' },
  { label: 'ค่าเช่า',              prefix: '54' },
  { label: 'สาธารณูปโภค',          prefix: '55' },
  { label: 'การตลาด',              prefix: '56' },
  { label: 'ค่าใช้จ่ายอื่นๆ',       prefix: '57' },
  { label: 'ภาษี',                 prefix: '58' },
  { label: 'ค่าเสื่อมราคา',         prefix: '59' },
]

export default function IncomeStatementPage() {
  const months = getMonths()
  const [month, setMonth] = useState(months[0].val)
  const [loading, setLoading] = useState(false)
  const [income, setIncome] = useState<AccountLine[]>([])
  const [expenses, setExpenses] = useState<AccountLine[]>([])
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/journal?month=${month}`)
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

      const incomeLines: AccountLine[]  = []
      const expenseLines: AccountLine[] = []

      for (const code of allCodes) {
        const dr = debitMap.get(code)  || 0
        const cr = creditMap.get(code) || 0
        if (code.startsWith('4')) incomeLines.push({ code, name: nameMap.get(code) || code, amount: cr - dr })
        if (code.startsWith('5')) expenseLines.push({ code, name: nameMap.get(code) || code, amount: dr - cr })
      }

      incomeLines.sort((a, b)  => a.code.localeCompare(b.code))
      expenseLines.sort((a, b) => a.code.localeCompare(b.code))
      setIncome(incomeLines)
      setExpenses(expenseLines)
    } finally {
      setLoading(false)
    }
  }

  const totalIncome   = income.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = expenses.reduce((s, l) => s + l.amount, 0)
  const netProfit     = totalIncome - totalExpenses
  const isProfit      = netProfit >= 0

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>งบกำไรขาดทุน</h1>

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
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>รายได้รวม</p>
              <p className="text-xs font-bold" style={{ color: '#166534' }}>฿{totalIncome.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>ค่าใช้จ่ายรวม</p>
              <p className="text-xs font-bold" style={{ color: '#991b1b' }}>฿{totalExpenses.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-2xl border p-3 text-center"
              style={{ background: isProfit ? '#f0fdf4' : '#fef2f2', borderColor: isProfit ? '#bbf7d0' : '#fecaca' }}>
              <p className="text-[10px] mb-0.5" style={{ color: isProfit ? '#166534' : '#991b1b' }}>{isProfit ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ'}</p>
              <p className="text-xs font-bold" style={{ color: isProfit ? '#166534' : '#991b1b' }}>
                {isProfit ? '' : '-'}฿{fmt(netProfit)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Income section */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-2.5 border-b font-semibold text-xs flex justify-between"
                style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
                <span>รายได้</span>
                <span>฿{fmt(totalIncome)}</span>
              </div>
              {income.length === 0 ? (
                <p className="text-center py-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>ไม่มีรายได้</p>
              ) : income.map(l => (
                <div key={l.code} className="flex items-center px-4 py-2.5 border-b text-xs"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="w-10 font-mono font-semibold shrink-0" style={{ color: '#166534' }}>{l.code}</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
                  <span className="font-mono font-semibold" style={{ color: '#166534' }}>฿{fmt(l.amount)}</span>
                </div>
              ))}
            </div>

            {/* Expense section — grouped */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-2.5 border-b font-semibold text-xs flex justify-between"
                style={{ background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' }}>
                <span>ค่าใช้จ่าย</span>
                <span>฿{fmt(totalExpenses)}</span>
              </div>
              {expenses.length === 0 ? (
                <p className="text-center py-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>ไม่มีค่าใช้จ่าย</p>
              ) : EXPENSE_GROUPS.map(g => {
                const items = expenses.filter(l => l.code.startsWith(g.prefix))
                if (items.length === 0) return null
                const subtotal = items.reduce((s, l) => s + l.amount, 0)
                return (
                  <div key={g.prefix}>
                    <div className="px-4 py-1.5 text-[10px] font-semibold flex justify-between"
                      style={{ background: '#fafafa', color: '#6b7280', borderBottom: '1px solid var(--border)' }}>
                      <span>{g.label}</span>
                      <span>฿{fmt(subtotal)}</span>
                    </div>
                    {items.map(l => (
                      <div key={l.code} className="flex items-center px-4 py-2.5 border-b text-xs"
                        style={{ borderColor: 'var(--border)' }}>
                        <span className="w-10 font-mono font-semibold shrink-0" style={{ color: '#9a3412' }}>{l.code}</span>
                        <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
                        <span className="font-mono" style={{ color: '#9a3412' }}>฿{fmt(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Net Profit row */}
            <div className="rounded-2xl border p-4 flex justify-between items-center"
              style={{ background: isProfit ? '#f0fdf4' : '#fef2f2', borderColor: isProfit ? '#86efac' : '#fca5a5' }}>
              <span className="font-bold text-sm" style={{ color: isProfit ? '#166534' : '#991b1b' }}>
                {isProfit ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ'}
              </span>
              <span className="font-bold text-base" style={{ color: isProfit ? '#166534' : '#991b1b' }}>
                {isProfit ? '' : '-'}฿{fmt(netProfit)}
              </span>
            </div>

            {totalIncome > 0 && (
              <div className="bg-white rounded-2xl border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
                <p className="font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>อัตรากำไร</p>
                <div className="flex justify-between" style={{ color: 'var(--muted-foreground)' }}>
                  <span>Gross Profit Margin</span>
                  <span className="font-semibold" style={{ color: isProfit ? '#166534' : '#991b1b' }}>
                    {((netProfit / totalIncome) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
