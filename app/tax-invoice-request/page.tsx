'use client'
import { useState } from 'react'

const emptyForm = () => ({
  contact_name: '',
  contact_tax_id: '',
  contact_address: '',
  contact_branch: '',
  contact_email: '',
  description: '',
  total_baht: '',
  payment_method: '',
  bill_image_url: '',
})

const PAYMENT_OPTIONS = [
  { value: 'cash', label: '💵 เงินสด' },
  { value: 'transfer', label: '🏦 โอนเงิน' },
  { value: 'credit_card', label: '💳 บัตรเครดิต (EDC)' },
]

export default function TaxInvoiceRequestPage() {
  const [form, setForm] = useState(emptyForm())
  const [billPreview, setBillPreview] = useState('')
  const [uploadingBill, setUploadingBill] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [lookingUpTaxId, setLookingUpTaxId] = useState(false)
  const [taxIdLookupError, setTaxIdLookupError] = useState('')

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setConfirmed(false)
  }

  async function lookupTaxId(digits: string, branchNumber: number) {
    setLookingUpTaxId(true)
    setTaxIdLookupError('')
    try {
      const res = await fetch(`/api/tax-lookup?tin=${digits}&branch=${branchNumber}`)
      const json = await res.json()
      if (!res.ok) { setTaxIdLookupError(json.error || 'ค้นหาไม่พบ กรุณากรอกชื่อ/ที่อยู่เอง'); return }
      setForm(f => ({ ...f, contact_name: json.name, contact_address: json.address, contact_branch: json.branch }))
    } catch {
      setTaxIdLookupError('เชื่อมต่อไม่สำเร็จ กรุณากรอกชื่อ/ที่อยู่เอง')
    } finally {
      setLookingUpTaxId(false)
    }
  }

  async function handleTaxIdChange(value: string) {
    const digits = value.replace(/[^0-9]/g, '').slice(0, 13)
    set('contact_tax_id', digits)
    setTaxIdLookupError('')
    if (digits.length === 13) lookupTaxId(digits, 0)
  }

  // Head-office and each branch have DIFFERENT registered addresses — if the customer
  // knows their branch number, re-look-up that branch's own name/address on blur.
  function handleBranchBlur(value: string) {
    if (form.contact_tax_id.length !== 13) return
    const digits = value.replace(/[^0-9]/g, '')
    if (!digits) return
    lookupTaxId(form.contact_tax_id, parseInt(digits, 10))
  }

  async function handleBillUpload(file: File) {
    setUploadingBill(true)
    setUploadError('')
    setBillPreview(URL.createObjectURL(file))
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload/receipt', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.url) { setUploadError('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่'); return }
      set('bill_image_url', json.url)
    } catch {
      setUploadError('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setUploadingBill(false)
    }
  }

  async function submitRequest() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tax-invoice-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'ส่งคำขอไม่สำเร็จ'); return }
      setSubmitted(true)
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.bill_image_url) { setUploadError('กรุณาแนบรูปถ่ายบิล/ใบเสร็จก่อน'); return }
    setShowWarning(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#EDEBDD' }}>
        <div className="max-w-sm w-full bg-white rounded-2xl p-6 text-center space-y-3 shadow">
          <div className="text-4xl">📨</div>
          <h1 className="text-lg font-bold" style={{ color: '#9D1F14' }}>ส่งคำขอสำเร็จ</h1>
          <p className="text-sm text-gray-600">
            ทางร้านได้รับคำขอและรูปบิลของท่านแล้ว อยู่ระหว่างการตรวจสอบ
            เมื่อตรวจสอบเสร็จ ระบบจะส่งใบกำกับภาษีไปยังอีเมลที่ท่านกรอกไว้โดยอัตโนมัติ
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#EDEBDD' }}>
      <div className="max-w-sm mx-auto bg-white rounded-2xl p-6 shadow space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold" style={{ color: '#9D1F14' }}>ขอใบกำกับภาษี</h1>
          <p className="text-xs text-gray-500">KINTSU Yakiniku</p>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-3">
          <Field label="รูปถ่ายบิล/ใบเสร็จ *">
            <label className="block border-2 border-dashed rounded-xl p-3 text-center cursor-pointer"
              style={{ borderColor: form.bill_image_url ? '#16A34A' : '#e5e7eb' }}>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleBillUpload(f) }} />
              {billPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={billPreview} alt="bill" className="max-h-48 mx-auto rounded-lg object-contain" />
              ) : (
                <span className="text-sm text-gray-500">📷 แตะเพื่อถ่ายรูปหรือเลือกรูปบิล</span>
              )}
              {uploadingBill && <p className="text-xs text-gray-400 mt-1">กำลังอัปโหลด...</p>}
              {form.bill_image_url && !uploadingBill && <p className="text-xs text-green-600 mt-1">✓ แนบรูปแล้ว (แตะเพื่อเปลี่ยนรูป)</p>}
            </label>
            {uploadError && <p className="text-xs text-red-500">❌ {uploadError}</p>}
          </Field>

          <Field label="เลขผู้เสียภาษี 13 หลัก">
            <input value={form.contact_tax_id} onChange={e => handleTaxIdChange(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="1234567890123" inputMode="numeric" maxLength={13} />
            {lookingUpTaxId && <p className="text-xs text-gray-400 mt-1">🔍 กำลังค้นหาชื่อ/ที่อยู่...</p>}
            {taxIdLookupError && <p className="text-xs text-amber-600 mt-1">⚠️ {taxIdLookupError}</p>}
          </Field>
          <Field label="ชื่อลูกค้า / บริษัท *">
            <input required value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="บริษัท ตัวอย่าง จำกัด" />
          </Field>
          <Field label="ที่อยู่">
            <textarea value={form.contact_address} onChange={e => set('contact_address', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" rows={2} placeholder="ที่อยู่สำหรับออกใบกำกับภาษี" />
          </Field>
          <Field label="สาขา">
            <input value={form.contact_branch} onChange={e => set('contact_branch', e.target.value)}
              onBlur={e => handleBranchBlur(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="สำนักงานใหญ่ / สาขาที่ ..." />
            <p className="text-[10px] text-gray-400 mt-1">ถ้าไม่ใช่สำนักงานใหญ่ กรอกเลขสาขา (เช่น 1) ระบบจะค้นหาที่อยู่สาขานั้นให้อัตโนมัติ</p>
          </Field>
          <Field label="อีเมลรับใบกำกับภาษี *">
            <input required type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="you@company.com" />
          </Field>
          <Field label="รายการ *">
            <input required value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="ค่าอาหารและเครื่องดื่ม" />
          </Field>
          <Field label="ยอดเงินรวมที่ชำระจริง (บาท, รวม VAT) *">
            <input required type="number" min="0" step="0.01" value={form.total_baht}
              onChange={e => set('total_baht', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="0.00" />
          </Field>
          <Field label="ช่องทางชำระเงิน *">
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => set('payment_method', opt.value)}
                  className="py-2 rounded-xl text-xs font-medium border-2 text-center"
                  style={{
                    borderColor: form.payment_method === opt.value ? '#D33F22' : '#e5e7eb',
                    color: form.payment_method === opt.value ? '#D33F22' : '#6b7280',
                    background: form.payment_method === opt.value ? '#FEF2F2' : 'white',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          {error && <p className="text-xs text-red-500">❌ {error}</p>}

          <button type="submit" disabled={loading || !form.payment_method || uploadingBill}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#D33F22' }}>
            {loading ? 'กำลังส่งคำขอ...' : 'ส่งคำขอใบกำกับภาษี'}
          </button>
          <p className="text-[10px] text-center text-gray-400">
            ทางร้านจะตรวจสอบรูปบิลก่อนออกใบกำกับภาษี กรุณาแนบรูปบิลที่ชัดเจนเห็นยอดเงินครบถ้วน
          </p>
        </form>
      </div>

      {showWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="max-w-sm w-full bg-white rounded-2xl p-6 text-center space-y-4 shadow-xl">
            <div className="text-4xl">⚠️</div>
            <p className="text-sm text-gray-700">
              กรุณาตรวจสอบข้อมูลของท่านให้ครบถ้วนและถูกต้องก่อนกด <b>&quot;ยืนยัน&quot;</b>
            </p>
            <p className="text-sm font-semibold text-red-600">
              หลังจากกดยืนยันแล้ว ท่านจะไม่สามารถแก้ไขข้อมูลที่ส่งไปได้
            </p>

            <label className="flex items-center gap-2 text-xs text-left cursor-pointer select-none">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                className="w-4 h-4 shrink-0" />
              ข้าพเจ้ายืนยันว่าข้อมูลที่ระบุข้างต้นถูกต้อง
            </label>

            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowWarning(false); setConfirmed(false) }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2"
                style={{ borderColor: '#e5e7eb', color: '#6b7280' }}>
                แก้ไขข้อมูล
              </button>
              <button type="button" disabled={!confirmed || loading}
                onClick={() => { setShowWarning(false); submitRequest() }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#D33F22' }}>
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )
}
