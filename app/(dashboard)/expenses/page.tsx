'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { formatBaht, toSatang } from '@/lib/money'
import { getTodayBKK } from '@/lib/utils'
import type { Expense, BankAccount, OcrData } from '@/types'

const CATEGORIES = ['วัตถุดิบ','ค่าแรง','ค่าเช่า','ค่าไฟ/แก๊ส','ค่าการตลาด','ค่าซ่อมบำรุง','วัสดุสิ้นเปลือง','อื่นๆ']
const BANK_OPTIONS = ['KBANK','SCB','KTB','BBL','TTB','GSB','BAY','CIMB','UOB','LH BANK']

// Map OCR bank names (Thai/English variants) → our standard bank codes
const BANK_ALIASES: Record<string, string> = {
  'KBANK': 'KBANK', 'กสิกรไทย': 'KBANK', 'KASIKORN': 'KBANK', 'K BANK': 'KBANK',
  'SCB': 'SCB', 'ไทยพาณิชย์': 'SCB', 'SIAM COMMERCIAL': 'SCB',
  'KTB': 'KTB', 'กรุงไทย': 'KTB', 'KRUNGTHAI': 'KTB',
  'BBL': 'BBL', 'กรุงเทพ': 'BBL', 'BANGKOK BANK': 'BBL',
  'TTB': 'TTB', 'ทหารไทย': 'TTB', 'TMB': 'TTB', 'TISCO': 'TTB', 'ทหารไทยธนชาต': 'TTB',
  'GSB': 'GSB', 'ออมสิน': 'GSB',
  'BAY': 'BAY', 'กรุงศรี': 'BAY', 'KRUNGSRI': 'BAY', 'AYUDHYA': 'BAY',
  'CIMB': 'CIMB',
  'UOB': 'UOB',
  'LH BANK': 'LH BANK', 'แลนด์แอนด์เฮ้าส์': 'LH BANK',
}

function normalizeBankName(raw: string): string {
  const upper = raw.toUpperCase().trim()
  for (const [key, val] of Object.entries(BANK_ALIASES)) {
    if (upper.includes(key.toUpperCase())) return val
  }
  return upper
}

// Extract visible digits from masked account e.g. "xxx-x-x5582-x" → "5582"
function visibleDigits(masked: string): string {
  return masked.replace(/x/gi, '').replace(/[^0-9]/g, '')
}

// Check if registered account contains the visible digits from OCR
function accountMatches(registered: string, ocrMasked: string): boolean {
  const digits = visibleDigits(ocrMasked)
  if (digits.length < 3) return false
  return registered.replace(/[^0-9]/g, '').includes(digits)
}

const emptyForm = () => ({
  date: getTodayBKK(),
  transfer_time: '',
  amount: '',
  category: '',
  bank_account_id: '',
  recipient_name: '',
  note: '',
  slip_image_url: '',
  slip_url_preview: '',
  slip_hash: '',
  ocr_data: null as OcrData | null,
  receipt_image_urls: [] as string[],
  receipt_previews: [] as string[],
})

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ocring, setOcring] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [date, setDate] = useState(getTodayBKK())
  const [form, setForm] = useState(emptyForm())
  const [userName, setUserName] = useState('')

  // Add bank form
  const [bankForm, setBankForm] = useState({ bank_name: '', account_number: '', account_name: '' })
  const [savingBank, setSavingBank] = useState(false)

  const slipRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const name = document.cookie.split(';').find(c => c.trim().startsWith('kintsu_acc_name='))
    if (name) setUserName(decodeURIComponent(name.split('=')[1]))
  }, [])

  const loadExpenses = useCallback(async () => {
    const res = await fetch(`/api/expenses?date=${date}&page=${page}`)
    const json = await res.json()
    setExpenses(json.data || [])
    setTotal(json.total || 0)
  }, [date, page])

  useEffect(() => { loadExpenses() }, [loadExpenses])
  useEffect(() => { loadBankAccounts() }, [])

  async function loadBankAccounts() {
    const res = await fetch('/api/bank-accounts')
    setBankAccounts(await res.json())
  }

  async function handleSlipUpload(file: File) {
    setOcring(true)
    // Show local preview immediately
    const preview = URL.createObjectURL(file)
    setForm(f => ({ ...f, slip_url_preview: preview }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const data = await res.json()
      // Auto-match sender bank + account number from OCR → registered bank accounts
      let matchedBankId = ''
      if (data.sender_bank) {
        const normalizedOCR = normalizeBankName(data.sender_bank)
        const sameBank = bankAccounts.filter(b => normalizeBankName(b.bank_name) === normalizedOCR)
        if (sameBank.length === 1) {
          // Only one account at this bank → use it
          matchedBankId = sameBank[0].id
        } else if (sameBank.length > 1 && data.sender_account) {
          // Multiple accounts → match by account number digits
          const byAccount = sameBank.find(b => accountMatches(b.account_number, data.sender_account))
          matchedBankId = byAccount ? byAccount.id : sameBank[0].id
        }
      }

      setForm(f => ({
        ...f,
        amount: data.amount_satang ? String(data.amount_satang / 100) : f.amount,
        date: data.date || f.date,
        transfer_time: data.time || f.transfer_time,
        recipient_name: data.recipient || f.recipient_name,
        slip_image_url: data.slip_image_url || f.slip_image_url,
        slip_hash: data.hash || f.slip_hash,
        ocr_data: data,
        bank_account_id: matchedBankId || f.bank_account_id,
      }))
    } catch { /* ignore */ }
    setOcring(false)
  }

  async function handleReceiptUpload(files: FileList) {
    setUploadingReceipt(true)
    const newUrls: string[] = []
    const newPreviews: string[] = []
    for (const file of Array.from(files)) {
      const preview = URL.createObjectURL(file)
      newPreviews.push(preview)
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/upload/receipt', { method: 'POST', body: fd })
        const data = await res.json()
        if (data.url) newUrls.push(data.url)
      } catch { /* ignore */ }
    }
    setForm(f => ({
      ...f,
      receipt_image_urls: [...f.receipt_image_urls, ...newUrls],
      receipt_previews: [...f.receipt_previews, ...newPreviews],
    }))
    setUploadingReceipt(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category) return
    setLoading(true)
    try {
      const amountSatang = toSatang(parseFloat(form.amount) || 0)
      const selectedBank = bankAccounts.find(b => b.id === form.bank_account_id)
      const paymentMethod = form.bank_account_id ? 'โอนเงิน' : 'เงินสด'

      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          category: form.category,
          amount_satang: amountSatang,
          payment_method: paymentMethod,
          bank_account_id: form.bank_account_id || null,
          transfer_time: form.transfer_time || null,
          sender_name: selectedBank ? selectedBank.account_name : null,
          sender_bank: selectedBank ? selectedBank.bank_name : null,
          sender_account: selectedBank ? selectedBank.account_number : null,
          recipient_name: form.recipient_name || null,
          slip_image_url: form.slip_image_url || null,
          slip_hash: form.slip_hash || null,
          ocr_data: form.ocr_data,
          receipt_image_urls: form.receipt_image_urls,
          note: form.note || null,
        }),
      })
      setShowForm(false)
      setForm(emptyForm())
      loadExpenses()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    loadExpenses()
  }

  async function handleAddBank(e: React.FormEvent) {
    e.preventDefault()
    setSavingBank(true)
    try {
      const res = await fetch('/api/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bankForm),
      })
      const json = await res.json()
      if (res.ok) {
        await loadBankAccounts()
        setShowAddBank(false)
        setBankForm({ bank_name: '', account_number: '', account_name: '' })
      } else {
        alert('บันทึกไม่สำเร็จ: ' + (json.error || res.status))
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + String(err))
    } finally {
      setSavingBank(false)
    }
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

      <button onClick={() => setShowForm(true)}
        className="w-full py-3 rounded-2xl font-semibold text-white"
        style={{ background: 'var(--flame-red)' }}>
        + บันทึกค่าใช้จ่าย
      </button>

      {/* Expense List */}
      <div className="space-y-2">
        {expenses.map(exp => (
          <div key={exp.id} className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    {exp.category}
                  </span>
                  {exp.ocr_data && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">📸 สลิป</span>
                  )}
                  {(exp.receipt_image_urls?.length ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600">🧾 {exp.receipt_image_urls.length} ใบ</span>
                  )}
                </div>
                {exp.recipient_name && (
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{exp.recipient_name}</p>
                )}
                {exp.note && <p className="text-sm truncate" style={{ color: 'var(--muted-foreground)' }}>{exp.note}</p>}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {exp.transfer_time && (
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{exp.transfer_time}</span>
                  )}
                  {exp.sender_bank && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100" style={{ color: 'var(--muted-foreground)' }}>
                      {exp.sender_bank}
                    </span>
                  )}
                  {exp.created_by_name && (
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>· {exp.created_by_name}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatBaht(exp.total_satang)}</p>
                {exp.slip_image_url && (
                  <a href={exp.slip_image_url} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-500 underline block mt-0.5">ดูสลิป</a>
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
            className="px-3 py-1 text-sm border rounded disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>←</button>
          <span className="text-sm px-2 py-1">{page} / {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>→</button>
        </div>
      )}

      {/* ── Add Expense Modal ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-2 sticky top-0 bg-white z-10 border-b"
              style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>บันทึกค่าใช้จ่าย</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

              {/* Date */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>วันที่ *</label>
                <input type="date" required value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* Time */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>เวลาโอน</label>
                <input type="time" value={form.transfer_time}
                  onChange={e => setForm(f => ({ ...f, transfer_time: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>ยอดเงิน (บาท) *</label>
                <input type="number" step="0.01" min="0" required
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-right text-base money-input"
                  style={{ borderColor: 'var(--border)' }} placeholder="0.00" />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>หมวดหมู่ *</label>
                <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* ชำระด้วย */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>ชำระด้วย *</label>
                  <button type="button" onClick={() => setShowAddBank(true)}
                    className="text-xs font-medium" style={{ color: 'var(--flame-red)' }}>
                    + เพิ่มบัญชี
                  </button>
                </div>
                <select required value={form.bank_account_id}
                  onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                  <option value="">-- เลือกบัญชี --</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} {b.account_number} · {b.account_name}
                    </option>
                  ))}
                  <option value="__cash__">เงินสด</option>
                  <option value="__card__">บัตรเครดิต</option>
                </select>
                {/* Show selected bank info */}
                {form.bank_account_id && !form.bank_account_id.startsWith('__') && (() => {
                  const b = bankAccounts.find(x => x.id === form.bank_account_id)
                  return b ? (
                    <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                      {b.bank_name} · {b.account_number} · {b.account_name}
                    </p>
                  ) : null
                })()}
              </div>

              {/* ผู้รับเงิน */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>ผู้รับเงิน</label>
                <input type="text" value={form.recipient_name}
                  onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น ร้านค้า ชื่อบัญชีปลายทาง" />
              </div>

              {/* หมายเหตุ */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>หมายเหตุ</label>
                <input type="text" value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น รายละเอียดเพิ่มเติม" />
              </div>

              {/* บันทึกโดย */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>บันทึกโดย</label>
                <input type="text" value={userName} readOnly
                  className="w-full border rounded-xl px-3 py-2.5 bg-gray-50" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* ── สลิป ─────────────────────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                  สลิป <span className="font-normal text-xs">(ไม่บังคับ)</span>
                </label>
                <input ref={slipRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSlipUpload(f) }} />

                {form.slip_url_preview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.slip_url_preview} alt="slip" className="w-full rounded-xl object-contain max-h-64 border"
                      style={{ borderColor: 'var(--border)' }} />
                    <button type="button" onClick={() => slipRef.current?.click()}
                      className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg">
                      เปลี่ยน
                    </button>
                    {form.ocr_data && (
                      <div className="mt-2 p-3 rounded-xl text-xs space-y-1"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                        {form.ocr_data.sender_name && <p>ผู้โอน: <span className="font-medium text-gray-700">{form.ocr_data.sender_name}</span></p>}
                        {form.ocr_data.sender_bank && <p>ธนาคาร: <span className="font-medium text-gray-700">{form.ocr_data.sender_bank} {form.ocr_data.sender_account}</span></p>}
                        {form.ocr_data.recipient && <p>ผู้รับ: <span className="font-medium text-gray-700">{form.ocr_data.recipient}</span></p>}
                        {form.ocr_data.ref_number && <p>อ้างอิง: <span className="font-medium text-gray-700">{form.ocr_data.ref_number}</span></p>}
                        {form.ocr_data.confidence > 0 && (
                          <p>ความมั่นใจ: <span className="font-medium text-green-600">{Math.round(form.ocr_data.confidence * 100)}%</span></p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => slipRef.current?.click()}
                    className="w-full py-4 border-2 border-dashed rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                    style={{ borderColor: ocring ? 'var(--flame-red)' : 'var(--border)', color: 'var(--muted-foreground)' }}>
                    {ocring ? (
                      <><span className="animate-spin">⏳</span> กำลังอ่านสลิป...</>
                    ) : (
                      <><span>📎</span> กดเพื่อแนบสลิป</>
                    )}
                  </button>
                )}
              </div>

              {/* ── ใบเสร็จ/บิล ──────────────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
                  ใบเสร็จ/บิล <span className="font-normal text-xs">(ไม่บังคับ — แนบได้หลายรูป)</span>
                </label>
                <input ref={receiptRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { const files = e.target.files; if (files?.length) handleReceiptUpload(files) }} />

                {form.receipt_previews.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {form.receipt_previews.map((p, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={p} alt={`receipt-${i}`}
                        className="w-full aspect-square object-cover rounded-lg border"
                        style={{ borderColor: 'var(--border)' }} />
                    ))}
                  </div>
                )}

                <button type="button" onClick={() => receiptRef.current?.click()}
                  className="w-full py-4 border-2 border-dashed rounded-xl text-sm flex items-center justify-center gap-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                  {uploadingReceipt ? (
                    <><span className="animate-spin">⏳</span> กำลังอัปโหลด...</>
                  ) : (
                    <><span>🧾</span> กดเพื่อแนบ ใบเสร็จ/บิล (แนบได้หลายรูป)</>
                  )}
                </button>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2 pb-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border rounded-xl font-medium" style={{ borderColor: 'var(--border)' }}>
                  ยกเลิก
                </button>
                <button type="submit" disabled={loading || ocring || uploadingReceipt}
                  className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--flame-red)' }}>
                  {loading ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Bank Account Modal ─────────────────────────────────────── */}
      {showAddBank && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowAddBank(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-base mb-4" style={{ color: 'var(--charcoal)' }}>เพิ่มบัญชีธนาคาร</h3>
            <form onSubmit={handleAddBank} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>ธนาคาร *</label>
                <select required value={bankForm.bank_name}
                  onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                  <option value="">-- เลือกธนาคาร --</option>
                  {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>เลขบัญชี *</label>
                <input type="text" required value={bankForm.account_number}
                  onChange={e => setBankForm(f => ({ ...f, account_number: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น 123-4-56789-0" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>ชื่อบัญชี *</label>
                <input type="text" required value={bankForm.account_name}
                  onChange={e => setBankForm(f => ({ ...f, account_name: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น Kintsu Yakiniku" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddBank(false)}
                  className="flex-1 py-2.5 border rounded-xl text-sm" style={{ borderColor: 'var(--border)' }}>
                  ยกเลิก
                </button>
                <button type="submit" disabled={savingBank}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--flame-red)' }}>
                  {savingBank ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
