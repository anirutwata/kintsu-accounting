'use client'
import { useState, useEffect } from 'react'

interface Account { code: string; name: string; type: string }
interface Entry {
  id: string
  date: string
  description: string
  reference: string
  debit_code: string
  debit_name: string
  credit_code: string
  credit_name: string
  amount_satang: number
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
  return (n / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'สินทรัพย์', liability: 'หนี้สิน', equity: 'ส่วนของเจ้าของ',
  income: 'รายได้', expense: 'ค่าใช้จ่าย',
}

export default function ManualJournalPage() {
  const months = getMonths()
  const today = new Date().toISOString().slice(0, 10)
  const [month, setMonth] = useState(months[0].val)
  const [entries, setEntries] = useState<Entry[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    date: today,
    description: '',
    reference: '',
    debit_code: '',
    credit_code: '',
    amount: '',
  })

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(d => setAccounts(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => { loadEntries() }, [month])

  async function loadEntries() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/manual-journal?month=${month}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'โหลดไม่สำเร็จ'); return }
      setEntries(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!form.date || !form.description || !form.debit_code || !form.credit_code || !form.amount) {
      setError('กรุณากรอกข้อมูลให้ครบ'); return
    }
    const amount_satang = Math.round(parseFloat(form.amount) * 100)
    if (isNaN(amount_satang) || amount_satang <= 0) { setError('จำนวนเงินไม่ถูกต้อง'); return }

    const debitAcc  = accounts.find(a => a.code === form.debit_code)
    const creditAcc = accounts.find(a => a.code === form.credit_code)

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/manual-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          description: form.description,
          reference: form.reference,
          debit_code: form.debit_code,
          debit_name: debitAcc?.name || form.debit_code,
          credit_code: form.credit_code,
          credit_name: creditAcc?.name || form.credit_code,
          amount_satang,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'บันทึกไม่สำเร็จ'); return }
      setForm({ date: today, description: '', reference: '', debit_code: '', credit_code: '', amount: '' })
      setShowForm(false)
      loadEntries()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    setConfirmDelete(null)
    await fetch(`/api/manual-journal/${id}`, { method: 'DELETE' })
    loadEntries()
  }

  // Group accounts by type for the select
  const grouped = ['asset', 'liability', 'equity', 'income', 'expense'].map(type => ({
    type,
    label: TYPE_LABELS[type],
    items: accounts.filter(a => a.type === type),
  })).filter(g => g.items.length > 0)

  const AccountSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border rounded-xl px-3 py-2 text-sm"
      style={{ borderColor: 'var(--border)' }}>
      <option value="">-- เลือกบัญชี --</option>
      {grouped.map(g => (
        <optgroup key={g.type} label={g.label}>
          {g.items.map(a => (
            <option key={a.code} value={a.code}>{a.code} {a.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>รายการปรับปรุง</h1>
        <button onClick={() => { setShowForm(v => !v); setError('') }}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl"
          style={{ background: showForm ? '#fef2f2' : 'var(--flame-red)', color: showForm ? '#991b1b' : 'white' }}>
          {showForm ? '✕ ยกเลิก' : '+ เพิ่มรายการ'}
        </button>
      </div>

      <select value={month} onChange={e => setMonth(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}>
        {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
      </select>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>บันทึกรายการปรับปรุง</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>วันที่</p>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>จำนวนเงิน (บาท)</p>
              <input type="text" inputMode="decimal" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
          </div>

          <div>
            <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>คำอธิบาย</p>
            <input type="text" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="เช่น บันทึกค่าเสื่อมราคา"
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
          </div>

          <div>
            <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>อ้างอิง (ไม่บังคับ)</p>
            <input type="text" value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              placeholder="เลขที่เอกสาร / หมายเหตุ"
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
          </div>

          <div>
            <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>เดบิต (Dr.)</p>
            <AccountSelect value={form.debit_code} onChange={v => setForm(f => ({ ...f, debit_code: v }))} />
          </div>

          <div>
            <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>เครดิต (Cr.)</p>
            <AccountSelect value={form.credit_code} onChange={v => setForm(f => ({ ...f, credit_code: v }))} />
          </div>

          {/* Preview */}
          {form.debit_code && form.credit_code && form.amount && (
            <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: '#f9fafb', border: '1px solid var(--border)' }}>
              <div className="flex justify-between">
                <span style={{ color: '#1d4ed8' }}>Dr. {form.debit_code}</span>
                <span style={{ color: '#1d4ed8' }}>฿{parseFloat(form.amount || '0').toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between pl-4">
                <span style={{ color: '#991b1b' }}>Cr. {form.credit_code}</span>
                <span style={{ color: '#991b1b' }}>฿{parseFloat(form.amount || '0').toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: saving ? '#d1d5db' : 'var(--flame-red)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
      ) : entries.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>ไม่มีรายการปรับปรุงในเดือนนี้</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-2.5 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {e.reference && <span className="ml-2">· {e.reference}</span>}
                  </p>
                  <p className="text-xs font-semibold truncate mt-0.5" style={{ color: 'var(--charcoal)' }}>{e.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>฿{fmt(e.amount_satang)}</p>
                </div>
              </div>
              <div className="px-4 pb-2.5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#1d4ed8' }}>Dr. {e.debit_code} {e.debit_name}</span>
                </div>
                <div className="flex justify-between text-xs pl-4">
                  <span style={{ color: '#991b1b' }}>Cr. {e.credit_code} {e.credit_name}</span>
                </div>
              </div>
              <div className="border-t px-4 py-2 flex justify-end" style={{ borderColor: 'var(--border)' }}>
                <button onClick={() => handleDelete(e.id)}
                  className="text-xs px-3 py-1 rounded-lg"
                  style={{
                    background: confirmDelete === e.id ? '#fef2f2' : '#f9fafb',
                    color: confirmDelete === e.id ? '#991b1b' : 'var(--muted-foreground)',
                    border: `1px solid ${confirmDelete === e.id ? '#fecaca' : 'var(--border)'}`,
                  }}>
                  {confirmDelete === e.id ? 'กดอีกครั้งเพื่อลบ' : 'ลบ'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
