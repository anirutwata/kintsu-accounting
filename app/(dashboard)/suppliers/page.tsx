'use client'
import { useState, useEffect } from 'react'
import type { Supplier } from '@/types'

const CATEGORIES = ['เนื้อ','ผัก','ซอส/เครื่องปรุง','เครื่องดื่ม','วัสดุสิ้นเปลือง','อื่นๆ']
const TERMS = [0, 7, 15, 30]

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', category: 'เนื้อ', contact_name: '', phone: '', credit_term_days: 0,
  })

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch('/api/suppliers')
    setSuppliers(await res.json())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { setShowForm(false); load() }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>ซัพพลายเออร์</h1>
        <button onClick={() => setShowForm(true)}
          className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--flame-red)' }}>+ เพิ่ม</button>
      </div>

      <div className="space-y-2">
        {suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between">
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{s.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{s.category}</p>
                {s.phone && <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{s.phone}</p>}
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${s.credit_term_days > 0 ? 'badge-credit' : 'badge-paid'}`}>
                  {s.credit_term_days > 0 ? `เครดิต ${s.credit_term_days} วัน` : 'เงินสด'}
                </span>
              </div>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="text-center py-12 text-gray-400">ยังไม่มีซัพพลายเออร์</div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">เพิ่มซัพพลายเออร์</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อ *</label>
                <input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>หมวดหมู่</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อผู้ติดต่อ</label>
                <input type="text" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>เบอร์โทร</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>เงื่อนไขเครดิต</label>
                <div className="grid grid-cols-4 gap-2">
                  {TERMS.map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, credit_term_days: t }))}
                      className="py-2 rounded-xl border text-sm font-medium transition-colors"
                      style={{
                        borderColor: form.credit_term_days === t ? 'var(--flame-red)' : 'var(--border)',
                        background: form.credit_term_days === t ? '#FEF2F2' : 'white',
                        color: form.credit_term_days === t ? 'var(--flame-red)' : 'var(--charcoal)',
                      }}>
                      {t === 0 ? 'สด' : `${t}วัน`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border rounded-xl" style={{ borderColor: 'var(--border)' }}>ยกเลิก</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--flame-red)' }}>บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
