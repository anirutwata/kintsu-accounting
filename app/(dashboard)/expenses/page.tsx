'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { formatBaht, toSatang } from '@/lib/money'
import { getTodayBKK, getMonthKey, formatThaiMonth } from '@/lib/utils'
import type { Expense, BankAccount, OcrData } from '@/types'

const BANK_OPTIONS = ['KBANK','SCB','KTB','BBL','TTB','GSB','BAY','BAAC','GHB','CIMB','UOB','KKP','LH BANK']

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
  'BAAC': 'BAAC', 'ธกส': 'BAAC', 'ธ.ก.ส': 'BAAC', 'เพื่อการเกษตร': 'BAAC',
  'GHB': 'GHB', 'อาคารสงเคราะห์': 'GHB',
  'KIATNAKIN': 'KKP', 'KKP': 'KKP', 'เกียรตินาคิน': 'KKP',
  'TBANK': 'TBANK', 'ธนชาต': 'TBANK',
}

function normalizeBankName(raw: string): string {
  const upper = raw.toUpperCase().trim()
  for (const [key, val] of Object.entries(BANK_ALIASES)) {
    if (upper.includes(key.toUpperCase())) return val
  }
  return upper
}

function visibleDigits(masked: string): string {
  return masked.replace(/x/gi, '').replace(/[^0-9]/g, '')
}

function formatAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 4) return `${digits.slice(0,3)}-${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0,3)}-${digits.slice(3,4)}-${digits.slice(4)}`
  return `${digits.slice(0,3)}-${digits.slice(3,4)}-${digits.slice(4,9)}-${digits.slice(9)}`
}

function accountMatches(registered: string, ocrMasked: string): boolean {
  const digits = visibleDigits(ocrMasked)
  if (digits.length < 3) return false
  return registered.replace(/[^0-9]/g, '').includes(digits)
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })
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

interface Category { id: string; name: string; sort_order: number }

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [month, setMonth] = useState(getMonthKey())
  const [showForm, setShowForm] = useState(false)
  const [showAddBank, setShowAddBank] = useState(false)
  const [showManageCat, setShowManageCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ocring, setOcring] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState(emptyForm())
  const [userName, setUserName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [bankMatchWarning, setBankMatchWarning] = useState('')

  const [bankForm, setBankForm] = useState({ bank_name: '', account_number: '', account_name: '' })
  const [savingBank, setSavingBank] = useState(false)

  const slipRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const name = document.cookie.split(';').find(c => c.trim().startsWith('kintsu_acc_name='))
    if (name) setUserName(decodeURIComponent(name.split('=')[1]))
  }, [])

  const loadExpenses = useCallback(async () => {
    const res = await fetch(`/api/expenses?month=${month}&page=${page}`)
    const json = await res.json()
    setExpenses(json.data || [])
    setTotal(json.total || 0)
  }, [month, page])

  useEffect(() => { loadExpenses() }, [loadExpenses])
  useEffect(() => { loadBankAccounts(); loadCategories() }, [])

  async function loadBankAccounts() {
    const res = await fetch('/api/bank-accounts')
    setBankAccounts(await res.json())
  }

  async function loadCategories() {
    const res = await fetch('/api/categories')
    setCategories(await res.json())
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim() }),
      })
      const json = await res.json()
      if (res.ok) { setNewCatName(''); await loadCategories() }
      else alert('เพิ่มไม่สำเร็จ: ' + (json.error || ''))
    } finally { setSavingCat(false) }
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!confirm(`ลบหมวดหมู่ "${name}" ?`)) return
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    await loadCategories()
    if (form.category === name) setForm(f => ({ ...f, category: '' }))
  }

  async function handleSlipUpload(file: File) {
    setOcring(true)
    const preview = URL.createObjectURL(file)
    setForm(f => ({ ...f, slip_url_preview: preview }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/ocr', { method: 'POST', body: fd })
      const data = await res.json()
      let matchedBankId = ''
      setBankMatchWarning('')
      if (data.sender_bank) {
        const normalizedOCR = normalizeBankName(data.sender_bank)
        const sameBank = bankAccounts.filter(b => normalizeBankName(b.bank_name) === normalizedOCR)
        if (sameBank.length === 1) {
          matchedBankId = sameBank[0].id
        } else if (sameBank.length > 1 && data.sender_account) {
          const byAccount = sameBank.find(b => accountMatches(b.account_number, data.sender_account))
          matchedBankId = byAccount ? byAccount.id : sameBank[0].id
        }
        // Fallback: OCR bank name might be wrong — try matching by account number only
        if (!matchedBankId && data.sender_account) {
          const byAccountOnly = bankAccounts.find(b => accountMatches(b.account_number, data.sender_account))
          if (byAccountOnly) matchedBankId = byAccountOnly.id
        }
        if (!matchedBankId) {
          setBankMatchWarning(`ไม่พบบัญชี "${data.sender_bank}${data.sender_account ? ` ${data.sender_account}` : ''}" ในระบบ — กรุณาเลือกเองหรือเพิ่มบัญชีใหม่`)
        }
      }
      setForm(f => ({
        ...f,
        amount: data.amount_satang ? (data.amount_satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : f.amount,
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
      const amountSatang = toSatang(parseFloat(form.amount.replace(/,/g, '')) || 0)
      const selectedBank = bankAccounts.find(b => b.id === form.bank_account_id)
      const isBank = form.bank_account_id && !form.bank_account_id.startsWith('__')
      const paymentMethod = isBank ? 'โอนเงิน' : form.bank_account_id === '__card__' ? 'บัตรเครดิต' : 'เงินสด'

      const body = {
        date: form.date,
        category: form.category,
        amount_satang: amountSatang,
        payment_method: paymentMethod,
        bank_account_id: isBank ? form.bank_account_id : null,
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
      }

      const url = editingId ? `/api/expenses/${editingId}` : '/api/expenses'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { alert('บันทึกไม่สำเร็จ: ' + (json.error || res.status)); return }
      setShowForm(false)
      setForm(emptyForm())
      setEditingId(null)
      loadExpenses()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
    setSelectedExpense(null)
    loadExpenses()
  }

  function openEdit(exp: Expense) {
    setEditingId(exp.id)
    setForm({
      date: exp.date,
      transfer_time: exp.transfer_time || '',
      amount: String(exp.amount_satang / 100),
      category: exp.category,
      bank_account_id: exp.bank_account_id || '',
      recipient_name: exp.recipient_name || '',
      note: exp.note || '',
      slip_image_url: exp.slip_image_url || '',
      slip_url_preview: exp.slip_image_url || '',
      slip_hash: '',
      ocr_data: exp.ocr_data as OcrData | null,
      receipt_image_urls: exp.receipt_image_urls || [],
      receipt_previews: exp.receipt_image_urls || [],
    })
    setSelectedExpense(null)
    setShowForm(true)
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

  const totalMonth = expenses.reduce((s, e) => s + e.total_satang, 0)

  // Group expenses by date descending
  const grouped: Record<string, Expense[]> = {}
  for (const exp of expenses) {
    if (!grouped[exp.date]) grouped[exp.date] = []
    grouped[exp.date].push(exp)
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>รายจ่าย</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>รวม {formatBaht(totalMonth)}</p>
        </div>
        <select value={month} onChange={e => { setMonth(e.target.value); setPage(1) }}
          className="text-sm border rounded-lg px-2 py-1.5" style={{ borderColor: 'var(--border)', background: 'white' }}>
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
            return <option key={key} value={key}>{formatThaiMonth(key)}</option>
          })}
        </select>
      </div>

      <button onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm(true) }}
        className="w-full py-3 rounded-2xl font-semibold text-white"
        style={{ background: 'var(--flame-red)' }}>
        + บันทึกค่าใช้จ่าย
      </button>

      {/* Expense List grouped by date */}
      <div className="space-y-4">
        {sortedDates.map(date => (
          <div key={date}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{formatDate(date)}</span>
              <span className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>
                {formatBaht(grouped[date].reduce((s, e) => s + e.total_satang, 0))}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[date].map(exp => (
                <button key={exp.id} onClick={() => setSelectedExpense(exp)}
                  className="w-full text-left bg-white rounded-2xl p-4 border transition-colors active:bg-gray-50"
                  style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                          {exp.category}
                        </span>
                        {exp.slip_image_url && (
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
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {expenses.length === 0 && (
          <div className="text-center py-12 text-gray-400">ยังไม่มีรายจ่ายเดือนนี้</div>
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

      {/* ── Detail Modal ──────────────────────────────────────────────── */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setSelectedExpense(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b sticky top-0 bg-white z-10"
              style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold text-base" style={{ color: 'var(--charcoal)' }}>รายละเอียด</h2>
              <button onClick={() => setSelectedExpense(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {/* Info rows */}
              <DetailRow label="วันที่" value={formatDate(selectedExpense.date)} />
              {selectedExpense.transfer_time && <DetailRow label="เวลาโอน" value={selectedExpense.transfer_time} />}
              <DetailRow label="หมวดหมู่" value={selectedExpense.category} />
              <DetailRow label="ยอดเงิน" value={formatBaht(selectedExpense.total_satang)} bold />
              <DetailRow label="วิธีชำระ" value={selectedExpense.payment_method} />
              {selectedExpense.sender_bank && (
                <DetailRow label="บัญชีโอน" value={`${selectedExpense.sender_bank} ${selectedExpense.sender_account || ''} ${selectedExpense.sender_name || ''}`} />
              )}
              {selectedExpense.recipient_name && <DetailRow label="ผู้รับเงิน" value={selectedExpense.recipient_name} />}
              {selectedExpense.note && <DetailRow label="หมายเหตุ" value={selectedExpense.note} />}
              {selectedExpense.created_by_name && <DetailRow label="บันทึกโดย" value={selectedExpense.created_by_name} />}

              {/* Slip image */}
              {selectedExpense.slip_image_url && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>สลิปโอนเงิน</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedExpense.slip_image_url} alt="slip"
                    onClick={() => setLightboxUrl(selectedExpense.slip_image_url!)}
                    className="w-full rounded-xl object-contain max-h-72 border cursor-pointer"
                    style={{ borderColor: 'var(--border)' }} />
                </div>
              )}

              {/* Receipt images */}
              {(selectedExpense.receipt_image_urls?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>ใบเสร็จ/บิล ({selectedExpense.receipt_image_urls.length} รูป)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedExpense.receipt_image_urls.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt={`receipt-${i}`}
                        onClick={() => setLightboxUrl(url)}
                        className="w-full aspect-square object-cover rounded-lg border cursor-pointer"
                        style={{ borderColor: 'var(--border)' }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => openEdit(selectedExpense)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2"
                  style={{ borderColor: 'var(--flame-red)', color: 'var(--flame-red)' }}>
                  แก้ไข
                </button>
                <button onClick={() => handleDelete(selectedExpense.id)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-red-200 text-red-400">
                  ลบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Lightbox ─────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
          onClick={() => setLightboxUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="full" className="max-w-full max-h-full object-contain p-4" />
          <button className="absolute top-4 right-4 text-white text-3xl leading-none" onClick={() => setLightboxUrl(null)}>×</button>
        </div>
      )}

      {/* ── Add / Edit Expense Modal ───────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null) } }}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-2 sticky top-0 bg-white z-10 border-b"
              style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>
                {editingId ? 'แก้ไขค่าใช้จ่าย' : 'บันทึกค่าใช้จ่าย'}
              </h2>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

              {/* Date + Time */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>วันที่ *</label>
                  <input type="date" required value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: 'var(--border)' }} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>เวลาโอน</label>
                  <input type="time" value={form.transfer_time}
                    onChange={e => setForm(f => ({ ...f, transfer_time: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: 'var(--border)' }} />
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>ยอดเงิน (บาท) *</label>
                <input type="text" inputMode="decimal" required
                  value={form.amount}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '')
                    if (/^\d*\.?\d{0,2}$/.test(raw)) setForm(f => ({ ...f, amount: raw }))
                  }}
                  onBlur={() => {
                    const num = parseFloat(form.amount.replace(/,/g, ''))
                    if (!isNaN(num) && num > 0)
                      setForm(f => ({ ...f, amount: num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }))
                  }}
                  onFocus={() => setForm(f => ({ ...f, amount: f.amount.replace(/,/g, '') }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-right text-base"
                  style={{ borderColor: 'var(--border)' }} placeholder="0.00" />
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>หมวดหมู่ *</label>
                  <button type="button" onClick={() => setShowManageCat(true)}
                    className="text-xs font-medium" style={{ color: 'var(--flame-red)' }}>
                    ⚙️ จัดการหมวดหมู่
                  </button>
                </div>
                <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
                {form.bank_account_id && !form.bank_account_id.startsWith('__') && (() => {
                  const b = bankAccounts.find(x => x.id === form.bank_account_id)
                  return b ? (
                    <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                      {b.bank_name} · {b.account_number} · {b.account_name}
                    </p>
                  ) : null
                })()}
                {bankMatchWarning && !form.bank_account_id && (
                  <p className="text-xs mt-1 px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700">{bankMatchWarning}</p>
                )}
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
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }}
                  className="flex-1 py-3 border rounded-xl font-medium" style={{ borderColor: 'var(--border)' }}>
                  ยกเลิก
                </button>
                <button type="submit" disabled={loading || ocring || uploadingReceipt}
                  className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--flame-red)' }}>
                  {loading ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Manage Categories Modal ───────────────────────────────────── */}
      {showManageCat && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowManageCat(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 max-h-[80vh] flex flex-col">
            <h3 className="font-bold text-base mb-4" style={{ color: 'var(--charcoal)' }}>จัดการหมวดหมู่</h3>
            <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                placeholder="ชื่อหมวดหมู่ใหม่"
                className="flex-1 border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
              <button type="submit" disabled={savingCat || !newCatName.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--flame-red)' }}>
                {savingCat ? '...' : '+ เพิ่ม'}
              </button>
            </form>
            <div className="overflow-y-auto flex-1 space-y-2">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--charcoal)' }}>{c.name}</span>
                  <button onClick={() => handleDeleteCategory(c.id, c.name)}
                    className="text-xs text-red-400 hover:text-red-600 ml-2">ลบ</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowManageCat(false)}
              className="mt-4 w-full py-2.5 border rounded-xl text-sm font-medium" style={{ borderColor: 'var(--border)' }}>
              ปิด
            </button>
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
                  onChange={e => setBankForm(f => ({ ...f, account_number: formatAccountNumber(e.target.value) }))}
                  inputMode="numeric"
                  className="w-full border rounded-xl px-3 py-2.5" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น 1234567890 → 123-4-56789-0" />
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

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span style={{ color: 'var(--muted-foreground)' }} className="shrink-0">{label}</span>
      <span className={bold ? 'font-semibold text-right' : 'text-right'} style={{ color: 'var(--charcoal)' }}>{value}</span>
    </div>
  )
}
