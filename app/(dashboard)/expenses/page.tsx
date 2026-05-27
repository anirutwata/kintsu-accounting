'use client'
import { useState, useEffect, useRef } from 'react'
import { formatBaht, toSatang } from '@/lib/money'
import { getTodayBKK } from '@/lib/utils'
import type { Expense, Supplier } from '@/types'

const CATEGORIES = ['วัตถุดิบ','ค่าแรง','ค่าเช่า','ค่าไฟ/แก๊ส','ค่าการตลาด','ค่าซ่อมบำรุง','วัสดุสิ้นเปลือง','อื่นๆ']
const PAYMENT_METHODS = ['เงินสด','โอนเงิน','บัตรเครดิต','เครดิต']

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ocring, setOcring] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [date, setDate] = useState(getTodayBKK())

  const [form, setForm] = useState({
    category: 'วัตถุดิบ',
    sub_category: '',
    supplier_id: '',
    amount: '',
    vat: '',
    payment_method: 'เงินสด',
    credit_due_date: '',
    note: '',
    slip_image_url: '',
    slip_hash: '',
    ocr_data: null as object | null,
  })

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadExpenses() }, [date, page])
  useEffect(() => { loadSuppliers() }, [])

  async function loadExpenses() {
    const res = await fetch(`/api/expenses?date=${date}&page=${page}`)
    const json = await res.json()
    setExpenses(json.data || [])
    setTotal(json.total || 0)
  }

  async function loadSuppliers() {
    const res = await fetch('/api/suppliers')
    setSuppliers(await res.json())
  }

  async function handleSlipUpload(file: File) {
    setOcring(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.amount_satang) {
        setForm(f => ({
          ...f,
          amount: String(data.amount_satang / 100),
          slip_image_url: data.slip_image_url || '',
          slip_hash: data.hash || '',
          ocr_data: data,
        }))
      }
    } catch { /* ignore */ }
    setOcring(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const amountSatang = toSatang(parseFloat(form.amount) || 0)
      const vatSatang = toSatang(parseFloat(form.vat) || 0)

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category,
          sub_category: form.sub_category || null,
          supplier_id: form.supplier_id || null,
          amount_satang: amountSatang,
          vat_satang: vatSatang,
          payment_method: form.payment_method,
          credit_due_date: form.credit_due_date || null,
          note: form.note,
          slip_image_url: form.slip_image_url || null,
          slip_hash: form.slip_hash || null,
          ocr_data: form.ocr_data,
          date,
        }),
      })
      if (res.ok) {
        setShowForm(false)
        setForm({ category: 'วัตถุดิบ', sub_category: '', supplier_id: '', amount: '', vat: '',
          payment_method: 'เงินสด', credit_due_date: '', note: '', slip_image_url: '', slip_hash: '', ocr_data: null })
        loadExpenses()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    loadExpenses()
  }

  const totalToday = expenses.reduce((s, e) => s + e.total_satang, 0)

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>รายจ่าย</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>รวม {formatBaht(totalToday)}</p>
        </div>
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setPage(1) }}
          className="text-sm border rounded-lg px-2 py-1.5" style={{ borderColor: 'var(--border)' }} />
      </div>

      {/* Add Expense Button */}
      <button onClick={() => setShowForm(true)}
        className="w-full py-3 rounded-2xl font-semibold text-white transition-colors"
        style={{ background: 'var(--flame-red)' }}>
        + บันทึกรายจ่าย
      </button>

      {/* Expense List */}
      <div className="space-y-2">
        {expenses.map(exp => (
          <div key={exp.id} className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    {exp.category}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${exp.is_paid ? 'badge-paid' : 'badge-unpaid'}`}>
                    {exp.is_paid ? 'ชำระแล้ว' : 'ค้างชำระ'}
                  </span>
                  {exp.ocr_data && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">📸 OCR</span>
                  )}
                </div>
                {exp.note && <p className="text-sm mt-1 truncate" style={{ color: 'var(--charcoal)' }}>{exp.note}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{exp.payment_method}</span>
                  {exp.created_by_name && (
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>· {exp.created_by_name}</span>
                  )}
                </div>
              </div>
              <div className="text-right ml-2">
                <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatBaht(exp.total_satang)}</p>
                {exp.vat_satang > 0 && (
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>VAT {formatBaht(exp.vat_satang)}</p>
                )}
                <button onClick={() => handleDelete(exp.id)}
                  className="text-xs mt-1 text-red-400 hover:text-red-600">ลบ</button>
              </div>
            </div>
          </div>
        ))}
        {expenses.length === 0 && (
          <div className="text-center py-12 text-gray-400">ยังไม่มีรายจ่ายวันนี้</div>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
            ←
          </button>
          <span className="text-sm px-2 py-1">{page} / {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
            →
          </button>
        </div>
      )}

      {/* Add Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--charcoal)' }}>บันทึกรายจ่าย</h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Slip Upload */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  สลิป / ใบเสร็จ (ถ้ามี)
                </label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSlipUpload(f) }} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full py-2.5 border-2 border-dashed rounded-xl text-sm transition-colors"
                  style={{ borderColor: ocring ? 'var(--flame-red)' : 'var(--border)', color: 'var(--muted-foreground)' }}>
                  {ocring ? '🔍 กำลังอ่านสลิป...' : form.slip_image_url ? '✅ อ่านสลิปแล้ว — กดเพื่อเปลี่ยน' : '📸 ถ่ายรูป / เลือกรูปสลิป'}
                </button>
                {form.ocr_data && (form.ocr_data as { confidence?: number }).confidence && (
                  <p className="text-xs mt-1 text-blue-600">
                    ความมั่นใจ: {Math.round(((form.ocr_data as { confidence: number }).confidence) * 100)}%
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  จำนวนเงิน (บาท) *
                </label>
                <input type="number" step="0.01" min="0" required
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-right money-input"
                  style={{ borderColor: 'var(--border)' }} placeholder="0.00" />
              </div>

              {/* VAT */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  ภาษี VAT (บาท)
                </label>
                <input type="number" step="0.01" min="0"
                  value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-right money-input"
                  style={{ borderColor: 'var(--border)' }} placeholder="0.00" />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  หมวดหมู่ *
                </label>
                <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  ซัพพลายเออร์
                </label>
                <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                  <option value="">— ไม่ระบุ —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  วิธีชำระ
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} type="button"
                      onClick={() => setForm(f => ({ ...f, payment_method: m }))}
                      className="py-2 rounded-xl border text-sm font-medium transition-colors"
                      style={{
                        borderColor: form.payment_method === m ? 'var(--flame-red)' : 'var(--border)',
                        background: form.payment_method === m ? '#FEF2F2' : 'white',
                        color: form.payment_method === m ? 'var(--flame-red)' : 'var(--charcoal)',
                      }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Credit due date */}
              {form.payment_method === 'เครดิต' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                    วันครบกำหนดชำระ
                  </label>
                  <input type="date" value={form.credit_due_date}
                    onChange={e => setForm(f => ({ ...f, credit_due_date: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }} />
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  รายละเอียด
                </label>
                <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น ซื้อเนื้อวากิว 5 kg" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border rounded-xl font-medium" style={{ borderColor: 'var(--border)' }}>
                  ยกเลิก
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--flame-red)' }}>
                  {loading ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
