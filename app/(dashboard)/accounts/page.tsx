'use client'
import { useState, useEffect } from 'react'

interface Account {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  parent_code: string | null
  note: string | null
  is_active: boolean
  auto?: boolean  // true = auto-generated from bank_accounts (read-only)
}

const TYPE_LABELS: Record<string, string> = {
  asset:     'สินทรัพย์',
  liability: 'หนี้สิน',
  equity:    'ส่วนของเจ้าของ',
  income:    'รายได้',
  expense:   'ค่าใช้จ่าย',
}

const TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  asset:     { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  liability: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  equity:    { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  income:    { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  expense:   { bg: '#fff7ed', color: '#9a3412', border: '#fed7aa' },
}

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const

type AccountType = typeof TYPES[number]
const EMPTY_FORM = { code: '', name: '', type: 'expense' as AccountType, parent_code: '', note: '' }

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/accounts')
    const data = await res.json()
    setAccounts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(a: Account) {
    setEditId(a.id)
    setForm({ code: a.code, name: a.name, type: a.type, parent_code: a.parent_code || '', note: a.note || '' })
    setError('')
    setShowForm(true)
  }

  async function save() {
    if (!form.code || !form.name) { setError('กรุณากรอกรหัสและชื่อบัญชี'); return }
    setSaving(true)
    setError('')
    try {
      const url = editId ? `/api/accounts/${editId}` : '/api/accounts'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      setShowForm(false)
      setEditId(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(a: Account) {
    await fetch(`/api/accounts/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...a, is_active: !a.is_active }),
    })
    load()
  }

  async function deleteAccount(id: string) {
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    setConfirmDelete(null)
    load()
  }

  const filtered = accounts.filter(a => {
    const matchType = filterType === 'all' || a.type === filterType
    const q = search.toLowerCase()
    const matchSearch = !q || a.code.includes(q) || a.name.toLowerCase().includes(q)
    return matchType && matchSearch
  })

  // Group by type in standard order
  const grouped = TYPES.map(type => ({
    type,
    items: filtered.filter(a => a.type === type),
  })).filter(g => g.items.length > 0)

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>ผังบัญชี</h1>
        <button onClick={openAdd}
          className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--flame-red)' }}>
          + เพิ่มบัญชี
        </button>
      </div>

      {/* Search + filter */}
      <div className="space-y-2">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหารหัสหรือชื่อบัญชี..."
          className="w-full border rounded-xl px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }} />
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {[['all', 'ทั้งหมด'], ...TYPES.map(t => [t, TYPE_LABELS[t]])].map(([val, label]) => (
            <button key={val} onClick={() => setFilterType(val)}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: filterType === val ? 'var(--flame-red)' : '#f3f4f6',
                color: filterType === val ? 'white' : 'var(--muted-foreground)',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary counts */}
      {!loading && (
        <div className="grid grid-cols-5 gap-1.5">
          {TYPES.map(t => {
            const c = TYPE_COLORS[t]
            const count = accounts.filter(a => a.type === t && a.is_active).length
            return (
              <button key={t} onClick={() => setFilterType(filterType === t ? 'all' : t)}
                className="rounded-xl p-2 text-center border transition-opacity"
                style={{ background: c.bg, borderColor: filterType === t ? c.color : c.border }}>
                <p className="text-base font-bold" style={{ color: c.color }}>{count}</p>
                <p className="text-[9px] font-medium leading-tight" style={{ color: c.color }}>{TYPE_LABELS[t]}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* Account list */}
      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
      ) : grouped.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>ไม่พบบัญชี</p>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ type, items }) => {
            const c = TYPE_COLORS[type]
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="text-xs font-bold" style={{ color: c.color }}>{TYPE_LABELS[type]}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: c.bg, color: c.color }}>
                    {items.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items.map(a => (
                    <div key={a.id}
                      className="bg-white rounded-2xl border p-3 flex items-center gap-3"
                      style={{ borderColor: 'var(--border)', opacity: a.is_active ? 1 : 0.5 }}>
                      {/* Code badge */}
                      <div className="shrink-0 w-14 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: c.bg }}>
                        <span className="text-xs font-bold" style={{ color: c.color }}>{a.code}</span>
                      </div>
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{a.name}</p>
                        {a.note && <p className="text-[10px] truncate" style={{ color: 'var(--muted-foreground)' }}>{a.note}</p>}
                        {!a.is_active && <p className="text-[10px]" style={{ color: '#9ca3af' }}>ปิดใช้งาน</p>}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {a.auto ? (
                          <span className="text-[10px] px-2 py-1 rounded-lg font-semibold"
                            style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                            อัตโนมัติ
                          </span>
                        ) : (
                          <>
                            <button onClick={() => openEdit(a)}
                              className="text-xs px-2 py-1 rounded-lg border transition-colors"
                              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                              แก้ไข
                            </button>
                            <button onClick={() => toggleActive(a)}
                              className="text-xs px-2 py-1 rounded-lg border transition-colors"
                              style={{ borderColor: 'var(--border)', color: a.is_active ? '#6b7280' : 'var(--flame-red)' }}>
                              {a.is_active ? 'ปิด' : 'เปิด'}
                            </button>
                            {confirmDelete === a.id ? (
                              <button onClick={() => deleteAccount(a.id)}
                                className="text-xs px-2 py-1 rounded-lg font-semibold text-white"
                                style={{ background: '#dc2626' }}>
                                ยืนยันลบ
                              </button>
                            ) : (
                              <button onClick={() => setConfirmDelete(a.id)}
                                className="text-xs px-2 py-1 rounded-lg"
                                style={{ color: '#dc2626' }}>
                                ลบ
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-2xl mx-auto bg-white rounded-t-3xl p-5 space-y-3 shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>
              {editId ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีใหม่'}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>รหัสบัญชี *</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="เช่น 5101"
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ประเภท *</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)' }}>
                  {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อบัญชี *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="เช่น ค่าใช้จ่ายทั่วไป"
                className="w-full border rounded-xl px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }} />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>บัญชีหลัก (parent code)</label>
              <input value={form.parent_code} onChange={e => setForm(f => ({ ...f, parent_code: e.target.value }))}
                placeholder="เช่น 5100 (ไม่บังคับ)"
                className="w-full border rounded-xl px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }} />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>หมายเหตุ</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)"
                className="w-full border rounded-xl px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }} />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-2">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-2xl border text-sm font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                ยกเลิก
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 py-2.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--flame-red)' }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
