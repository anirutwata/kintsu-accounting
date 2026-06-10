'use client'
import { useState, useEffect } from 'react'

interface AccountBalance {
  code: string
  name: string
  type: string
  debit: number
  credit: number
}

const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense']
const TYPE_LABELS: Record<string, string> = {
  asset:     'สินทรัพย์',
  liability: 'หนี้สิน',
  equity:    'ส่วนของเจ้าของ',
  income:    'รายได้',
  expense:   'ค่าใช้จ่าย',
}
const TYPE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  asset:     { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  liability: { color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  equity:    { color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  income:    { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  expense:   { color: '#9a3412', bg: '#fff7ed', border: '#fed7aa' },
}

function guessType(code: string): string {
  if (code.startsWith('1')) return 'asset'
  if (code.startsWith('2')) return 'liability'
  if (code.startsWith('3')) return 'equity'
  if (code.startsWith('4')) return 'income'
  return 'expense'
}

function fmt(n: number) {
  if (n === 0) return '-'
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export default function TrialBalancePage() {
  const months = getMonths()
  const [month, setMonth] = useState(months[0].val)
  const [loading, setLoading] = useState(false)
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [error, setError] = useState('')

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [journalRes, accountsRes] = await Promise.all([
        fetch(`/api/journal?month=${month}`),
        fetch('/api/accounts'),
      ])
      const journalData = await journalRes.json()
      const accountsData = await accountsRes.json()

      if (!journalRes.ok) { setError(journalData.error || 'โหลดไม่สำเร็จ'); return }

      const entries: { debit_code: string; debit_name: string; credit_code: string; credit_name: string; amount: number }[] = journalData.entries || []
      const accounts: { code: string; name: string; type: string }[] = Array.isArray(accountsData) ? accountsData : []

      const typeMap = new Map(accounts.map(a => [a.code, a.type]))
      const nameMap = new Map(accounts.map(a => [a.code, a.name]))

      const debitMap = new Map<string, number>()
      const creditMap = new Map<string, number>()
      const codeNames = new Map<string, string>()

      for (const e of entries) {
        debitMap.set(e.debit_code, (debitMap.get(e.debit_code) || 0) + e.amount)
        creditMap.set(e.credit_code, (creditMap.get(e.credit_code) || 0) + e.amount)
        if (!nameMap.has(e.debit_code)) codeNames.set(e.debit_code, e.debit_name)
        if (!nameMap.has(e.credit_code)) codeNames.set(e.credit_code, e.credit_name)
      }

      const allCodes = new Set([...debitMap.keys(), ...creditMap.keys()])
      const result: AccountBalance[] = []
      for (const code of allCodes) {
        result.push({
          code,
          name: nameMap.get(code) || codeNames.get(code) || code,
          type: typeMap.get(code) || guessType(code),
          debit: debitMap.get(code) || 0,
          credit: creditMap.get(code) || 0,
        })
      }
      result.sort((a, b) => a.code.localeCompare(b.code))
      setBalances(result)
    } finally {
      setLoading(false)
    }
  }

  const grouped = TYPE_ORDER.map(type => ({
    type,
    items: balances.filter(b => b.type === type),
  })).filter(g => g.items.length > 0)

  const totalDebit  = balances.reduce((s, b) => s + b.debit, 0)
  const totalCredit = balances.reduce((s, b) => s + b.credit, 0)
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.02

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>งบทดลอง</h1>

      <select value={month} onChange={e => setMonth(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}>
        {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
      </select>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
      ) : balances.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>ไม่มีข้อมูล</p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>รวมเดบิต</p>
              <p className="text-xs font-bold" style={{ color: '#1d4ed8' }}>฿{totalDebit.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>รวมเครดิต</p>
              <p className="text-xs font-bold" style={{ color: '#991b1b' }}>฿{totalCredit.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-2xl border p-3 text-center"
              style={{ background: isBalanced ? '#f0fdf4' : '#fef2f2', borderColor: isBalanced ? '#bbf7d0' : '#fecaca' }}>
              <p className="text-[10px] mb-0.5" style={{ color: isBalanced ? '#166534' : '#991b1b' }}>สมดุล</p>
              <p className="text-xs font-bold" style={{ color: isBalanced ? '#166534' : '#991b1b' }}>
                {isBalanced ? '✓ ถูกต้อง' : '✗ ไม่สมดุล'}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {/* Column headers */}
            <div className="grid px-3 py-2 text-[10px] font-semibold border-b"
              style={{ gridTemplateColumns: '3rem 1fr 5.5rem 5.5rem', color: 'var(--muted-foreground)', borderColor: 'var(--border)', background: '#f9fafb' }}>
              <span>รหัส</span>
              <span>ชื่อบัญชี</span>
              <span className="text-right">เดบิต</span>
              <span className="text-right">เครดิต</span>
            </div>

            {grouped.map(({ type, items }) => {
              const c = TYPE_COLORS[type]
              const gDebit  = items.reduce((s, b) => s + b.debit, 0)
              const gCredit = items.reduce((s, b) => s + b.credit, 0)
              return (
                <div key={type}>
                  <div className="flex justify-between items-center px-3 py-1.5 text-[10px] font-bold border-b"
                    style={{ background: c.bg, color: c.color, borderColor: c.border }}>
                    <span>{TYPE_LABELS[type]}</span>
                    <span className="font-mono text-[9px]">Dr {fmt(gDebit)} / Cr {fmt(gCredit)}</span>
                  </div>
                  {items.map(b => (
                    <div key={b.code} className="grid px-3 py-2 border-b text-xs items-center"
                      style={{ gridTemplateColumns: '3rem 1fr 5.5rem 5.5rem', borderColor: 'var(--border)' }}>
                      <span className="font-mono font-semibold text-[11px]" style={{ color: c.color }}>{b.code}</span>
                      <span className="truncate pr-2" style={{ color: 'var(--charcoal)' }}>{b.name}</span>
                      <span className="text-right font-mono" style={{ color: b.debit > 0 ? '#1d4ed8' : '#d1d5db' }}>{fmt(b.debit)}</span>
                      <span className="text-right font-mono" style={{ color: b.credit > 0 ? '#991b1b' : '#d1d5db' }}>{fmt(b.credit)}</span>
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Total */}
            <div className="grid px-3 py-2.5 text-xs font-bold"
              style={{ gridTemplateColumns: '3rem 1fr 5.5rem 5.5rem', background: '#f9fafb', borderTop: '1px solid var(--border)' }}>
              <span className="col-span-2" style={{ color: 'var(--charcoal)' }}>รวมทั้งหมด</span>
              <span className="text-right font-mono" style={{ color: '#1d4ed8' }}>{fmt(totalDebit)}</span>
              <span className="text-right font-mono" style={{ color: '#991b1b' }}>{fmt(totalCredit)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
