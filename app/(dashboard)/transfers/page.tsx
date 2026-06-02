'use client'
import { useState, useEffect } from 'react'
import { formatBaht, toSatang, parseInput } from '@/lib/money'
import { getTodayBKK } from '@/lib/utils'

interface BankAccount { id: string; bank_name: string; account_number: string; account_name: string }
interface Transfer {
  id: string
  date: string
  amount_satang: number
  from_bank: string
  from_account: string | null
  to_bank: string
  to_account: string | null
  note: string | null
  created_by_name: string | null
}

function getClientRole() {
  if (typeof document === 'undefined') return ''
  return document.cookie.match(/kintsu_acc_role=([^;]+)/)?.[1] ?? ''
}

function fmtMoneyVal(val: string): string {
  const num = parseFloat(val.replace(/,/g, ''))
  if (!val || isNaN(num)) return val
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TransfersPage() {
  const today = getTodayBKK()
  const [role, setRole] = useState('')
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState({
    date: today,
    amount: '',
    from_bank: '',
    from_account: '',
    to_bank: '',
    to_account: '',
    note: '',
  })

  useEffect(() => {
    setRole(getClientRole())
    load()
    loadAccounts()
  }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/transfers')
    setTransfers(await res.json())
    setLoading(false)
  }

  async function loadAccounts() {
    const res = await fetch('/api/bank-accounts')
    const data = await res.json()
    setAccounts(Array.isArray(data) ? data : [])
  }

  function openAdd() {
    setForm({ date: today, amount: '', from_bank: '', from_account: '', to_bank: '', to_account: '', note: '' })
    setSaveError('')
    setShowForm(true)
  }

  function handleAccountSelect(side: 'from' | 'to', accountId: string) {
    const acc = accounts.find(a => a.id === accountId)
    if (!acc) {
      setForm(f => side === 'from'
        ? { ...f, from_bank: '', from_account: '' }
        : { ...f, to_bank: '', to_account: '' })
      return
    }
    setForm(f => side === 'from'
      ? { ...f, from_bank: acc.bank_name, from_account: acc.account_number }
      : { ...f, to_bank: acc.bank_name, to_account: acc.account_number })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.from_bank === form.to_bank && form.from_account === form.to_account) {
      setSaveError('บัญชีต้นทางและปลายทางต้องต่างกัน')
      return
    }
    setSaving(true)
    setSaveError('')
    const res = await fetch('/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: form.date,
        amount_satang: toSatang(parseInput(form.amount)),
        from_bank: form.from_bank,
        from_account: form.from_account || null,
        to_bank: form.to_bank,
        to_account: form.to_account || null,
        note: form.note || null,
      }),
    })
    if (res.ok) {
      setShowForm(false)
      load()
    } else {
      const err = await res.json()
      setSaveError(err.error || 'บันทึกไม่สำเร็จ')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    const res = await fetch(`/api/transfers/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      load()
    }
    setDeleting(false)
  }

  // Group by month
  const grouped: Record<string, Transfer[]> = {}
  transfers.forEach(t => {
    const m = t.date.substring(0, 7)
    if (!grouped[m]) grouped[m] = []
    grouped[m].push(t)
  })

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>โอนเงินระหว่างบัญชี</h1>
        {(role === 'owner' || role === 'manager') && (
          <button onClick={openAdd}
            className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--flame-red)' }}>
            + บันทึก
          </button>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold" style={{ color: 'var(--charcoal)' }}>บันทึกการโอนเงิน</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            {saveError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded-xl">{saveError}</p>}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Date */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>วันที่</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  required className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ยอดโอน (บาท)</label>
                <input type="text" inputMode="decimal" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  onBlur={() => setForm(f => ({ ...f, amount: fmtMoneyVal(f.amount) }))}
                  onFocus={() => setForm(f => ({ ...f, amount: f.amount.replace(/,/g, '') }))}
                  required placeholder="0.00" className="w-full border rounded-xl px-3 py-2 text-sm text-right" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* From account */}
              <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--muted)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>บัญชีต้นทาง (โอนออก)</p>
                {accounts.length > 0 && (
                  <select onChange={e => handleAccountSelect('from', e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }}>
                    <option value="">-- เลือกบัญชี --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number} ({a.account_name})</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={form.from_bank} onChange={e => setForm(f => ({ ...f, from_bank: e.target.value }))}
                    required placeholder="ธนาคาร*" className="border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }} />
                  <input type="text" value={form.from_account} onChange={e => setForm(f => ({ ...f, from_account: e.target.value }))}
                    placeholder="เลขบัญชี" className="border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }} />
                </div>
              </div>

              {/* To account */}
              <div className="p-3 rounded-xl space-y-2" style={{ background: '#EFF6FF' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>บัญชีปลายทาง (รับโอน)</p>
                {accounts.length > 0 && (
                  <select onChange={e => handleAccountSelect('to', e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }}>
                    <option value="">-- เลือกบัญชี --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number} ({a.account_name})</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={form.to_bank} onChange={e => setForm(f => ({ ...f, to_bank: e.target.value }))}
                    required placeholder="ธนาคาร*" className="border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }} />
                  <input type="text" value={form.to_account} onChange={e => setForm(f => ({ ...f, to_account: e.target.value }))}
                    placeholder="เลขบัญชี" className="border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }} />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>หมายเหตุ</label>
                <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="ไม่บังคับ" className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--flame-red)' }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</div>
      ) : transfers.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>ยังไม่มีรายการโอนเงิน</div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => (
          <div key={month} className="space-y-2">
            <p className="text-xs font-semibold px-1" style={{ color: 'var(--muted-foreground)' }}>
              {new Date(month + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              <span className="ml-2">
                {formatBaht(items.reduce((s, t) => s + t.amount_satang, 0))}
              </span>
            </p>
            {items.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', borderLeft: '4px solid #9F8966' }}>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--flame-red)' }}>{formatBaht(t.amount_satang)}</p>
                      <div className="mt-1 space-y-0.5">
                        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          <span className="shrink-0">จาก:</span>
                          <span className="font-medium" style={{ color: 'var(--charcoal)' }}>
                            {t.from_bank}{t.from_account ? ` · ${t.from_account}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          <span className="shrink-0">ไปยัง:</span>
                          <span className="font-medium" style={{ color: '#1D4ED8' }}>
                            {t.to_bank}{t.to_account ? ` · ${t.to_account}` : ''}
                          </span>
                        </div>
                        {t.note && <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t.note}</p>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {new Date(t.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </p>
                      {(role === 'owner' || role === 'manager') && (
                        deleteConfirm === t.id ? (
                          <div className="flex gap-1 mt-1">
                            <button onClick={() => handleDelete(t.id)} disabled={deleting}
                              className="text-xs px-2 py-1 rounded-lg text-white disabled:opacity-50"
                              style={{ background: '#DC2626' }}>
                              {deleting ? '...' : 'ลบ'}
                            </button>
                            <button onClick={() => setDeleteConfirm(null)}
                              className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(t.id)}
                            className="mt-1 text-xs text-red-400">ลบ</button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
