'use client'
import { useRef, useState } from 'react'
import { getTodayBKK } from '@/lib/utils'
import { compressImageFile } from '@/lib/compressImage'
import { ImageLightbox } from '@/components/ImageLightbox'

// Everything on this page is Thai — a native <input type="date"> renders in whatever
// language the customer's device happens to be set to (e.g. "24 Aug 2026"), which the
// page can't override. Three plain <select>s sidestep that entirely: day / เดือน (Thai
// name) / ปี (พ.ศ.), a layout Thai government and bank forms already use.
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const BUDDHIST_ERA_OFFSET = 543

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate() // month is 1-12; day 0 of next month = last day of this one
}

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// สาขา always resolves to one of these two labels — never customer-typed free text —
// so the label sent to FlowAccount can never end up blank (which FlowAccount silently
// defaults to "สำนักงานใหญ่", contradicting a branch number the customer put in their
// company name instead).
function resolveBranchLabel(isHeadOffice: boolean, branchNumber: string): string {
  if (isHeadOffice) return 'สำนักงานใหญ่'
  const digits = branchNumber.replace(/[^0-9]/g, '')
  // Thai VAT branch codes are conventionally written as 5 digits (e.g. 00016) — pad
  // whatever the customer typed ("16" or "00016") so the label is always in that form.
  return digits ? `สาขาที่ ${digits.padStart(5, '0')}` : ''
}

const emptyForm = () => ({
  document_date: getTodayBKK(), // วันที่ในบิล/ใบเสร็จ — ใช้เป็นวันที่บนใบกำกับภาษี ไม่ใช่วันที่อนุมัติ
  contact_group: 'juristic' as 'juristic' | 'individual',
  contact_name: '',
  contact_tax_id: '',
  contact_address: '',
  branch_is_head_office: true,
  branch_number: '',
  contact_branch: resolveBranchLabel(true, ''),
  contact_email: '',
  subtotal_baht: '',
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
  const [billOcring, setBillOcring] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [lookingUpTaxId, setLookingUpTaxId] = useState(false)
  const [taxIdLookupError, setTaxIdLookupError] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const billInputRef = useRef<HTMLInputElement>(null)

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setConfirmed(false)
  }

  // Merges a change from one of the three date <select>s into form.document_date, clamping
  // the day if the new month/year has fewer days (e.g. 31 มกราคม → กุมภาพันธ์ clamps to 28/29),
  // and never letting the combination land in the future (the month/year options are also
  // capped for the current year so this is a backstop, not the primary guard).
  function updateDate(change: { day?: number; month?: number; year?: number }) {
    const current = parseIsoDate(form.document_date)
    const next = { ...current, ...change }
    const maxDay = daysInMonth(next.year, next.month)
    const iso = toIsoDate(next.year, next.month, Math.min(next.day, maxDay))
    const todayIso = getTodayBKK()
    set('document_date', iso > todayIso ? todayIso : iso)
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
    if (digits.length === 13) {
      const branchNumber = form.branch_is_head_office ? 0 : parseInt(form.branch_number, 10) || 0
      lookupTaxId(digits, branchNumber)
    }
  }

  function handleBranchChoice(isHeadOffice: boolean) {
    const branchNumber = isHeadOffice ? '' : form.branch_number
    setForm(f => ({
      ...f, branch_is_head_office: isHeadOffice, branch_number: branchNumber,
      contact_branch: resolveBranchLabel(isHeadOffice, branchNumber),
    }))
    setConfirmed(false)
    if (form.contact_tax_id.length === 13) {
      lookupTaxId(form.contact_tax_id, isHeadOffice ? 0 : parseInt(branchNumber, 10) || 0)
    }
  }

  function handleBranchNumberChange(value: string) {
    const digits = value.replace(/[^0-9]/g, '')
    setForm(f => ({ ...f, branch_number: digits, contact_branch: resolveBranchLabel(false, digits) }))
    setConfirmed(false)
  }

  // Head-office and each branch have DIFFERENT registered addresses — if the customer
  // knows their branch number, re-look-up that branch's own name/address on blur.
  function handleBranchNumberBlur(digits: string) {
    if (form.contact_tax_id.length !== 13 || !digits) return
    lookupTaxId(form.contact_tax_id, parseInt(digits, 10))
  }

  async function handleBillUpload(file: File) {
    setUploadingBill(true)
    setUploadError('')
    setBillPreview(URL.createObjectURL(file))
    try {
      const compressed = await compressImageFile(file)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await fetch('/api/upload/receipt', { method: 'POST', body: fd })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) {
        setUploadError(`อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่${json?.error ? ` (${json.error})` : ''}`)
        return
      }
      set('bill_image_url', json.url)
      scanBillFields(json.url)
    } catch (err: any) {
      setUploadError(`อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่${err?.message ? ` (${err.message})` : ''}`)
    } finally {
      setUploadingBill(false)
    }
  }

  // Reads วันที่/ยอดก่อน VAT/ยอดชำระจริง/ช่องทางชำระเงิน straight off the bill photo so the customer
  // doesn't have to hunt for and retype numbers already printed in front of them — every
  // field OCR fills in stays a normal editable input, and re-uploading a photo (เปลี่ยนรูป)
  // re-scans and overwrites with the new bill's numbers.
  async function scanBillFields(billUrl: string) {
    setBillOcring(true)
    try {
      const res = await fetch('/api/ocr/tax-invoice-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: billUrl }),
      })
      const json = await res.json()
      if (!res.ok) return
      setForm(f => {
        const todayIso = getTodayBKK()
        const documentDate = json.documentDate && json.documentDate <= todayIso ? json.documentDate : f.document_date
        return {
          ...f,
          document_date: documentDate,
          subtotal_baht: json.subtotalBaht != null ? String(json.subtotalBaht) : f.subtotal_baht,
          total_baht: json.totalBaht != null ? String(json.totalBaht) : f.total_baht,
          payment_method: json.paymentMethod || f.payment_method,
        }
      })
    } catch {
      // Best-effort — the customer can always fill these in by hand.
    } finally {
      setBillOcring(false)
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
            <input ref={billInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBillUpload(f) }} />
            <div className="block border-2 border-dashed rounded-xl p-3 text-center"
              style={{ borderColor: form.bill_image_url ? '#16A34A' : '#e5e7eb' }}>
              {billPreview ? (
                <button type="button" className="mx-auto block cursor-zoom-in" onClick={() => setLightboxUrl(billPreview)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={billPreview} alt="บิลหรือใบเสร็จ" className="max-h-48 mx-auto rounded-lg object-contain" />
                  <span className="mt-1 block text-xs text-gray-500">แตะรูปเพื่อดูขนาดใหญ่</span>
                </button>
              ) : (
                <button type="button" onClick={() => billInputRef.current?.click()} className="text-sm text-gray-500">
                  📷 แตะเพื่อถ่ายรูปหรือเลือกรูปบิล
                </button>
              )}
              {uploadingBill && <p className="text-xs text-gray-400 mt-1">กำลังอัปโหลด...</p>}
              {billOcring && <p className="text-xs text-gray-400 mt-1">🔍 กำลังอ่านวันที่/ยอดเงินจากบิล...</p>}
              {form.bill_image_url && !uploadingBill && !billOcring && (
                <button type="button" onClick={() => billInputRef.current?.click()} className="mt-2 text-xs font-medium text-green-700 underline">
                  ✓ แนบรูปแล้ว · เปลี่ยนรูป
                </button>
              )}
            </div>
            {uploadError && <p className="text-xs text-red-500">❌ {uploadError}</p>}
          </Field>

          <Field label="วันที่ในบิล/ใบเสร็จ *">
            {(() => {
              const today = parseIsoDate(getTodayBKK())
              const dateParts = parseIsoDate(form.document_date)
              const isCurrentYear = dateParts.year === today.year
              const isCurrentYearMonth = isCurrentYear && dateParts.month === today.month
              const maxDay = Math.min(daysInMonth(dateParts.year, dateParts.month), isCurrentYearMonth ? today.day : 31)
              return (
                <div className="grid grid-cols-3 gap-2">
                  <select required value={dateParts.day}
                    onChange={e => updateDate({ day: Number(e.target.value) })}
                    className="border rounded-xl px-1 py-2 text-sm text-center">
                    {Array.from({ length: maxDay }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select required value={dateParts.month}
                    onChange={e => updateDate({ month: Number(e.target.value) })}
                    className="border rounded-xl px-1 py-2 text-sm">
                    {THAI_MONTHS.map((name, i) => (
                      (!isCurrentYear || i + 1 <= today.month) &&
                      <option key={i} value={i + 1}>{name}</option>
                    ))}
                  </select>
                  <select required value={dateParts.year}
                    onChange={e => updateDate({ year: Number(e.target.value) })}
                    className="border rounded-xl px-1 py-2 text-sm">
                    {Array.from({ length: 6 }, (_, i) => today.year - i).map(y => (
                      <option key={y} value={y}>{y + BUDDHIST_ERA_OFFSET}</option>
                    ))}
                  </select>
                </div>
              )
            })()}
            <p className="text-[10px] text-gray-400 mt-1">วันที่ตามที่ระบุบนบิล — จะใช้เป็นวันที่บนใบกำกับภาษี</p>
          </Field>

          <Field label="ประเภทผู้เสียภาษี *">
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'juristic' as const, label: 'นิติบุคคล' },
                { value: 'individual' as const, label: 'บุคคลธรรมดา' },
              ]).map(opt => (
                <label key={opt.value}
                  className="flex items-center gap-2 py-2 px-3 rounded-xl text-sm border cursor-pointer"
                  style={{ borderColor: form.contact_group === opt.value ? '#D33F22' : '#e5e7eb' }}>
                  <input type="radio" name="contact_group" checked={form.contact_group === opt.value}
                    onChange={() => set('contact_group', opt.value)} className="w-4 h-4 shrink-0" />
                  {opt.label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="เลขผู้เสียภาษี 13 หลัก">
            <input value={form.contact_tax_id} onChange={e => handleTaxIdChange(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="1234567890123" inputMode="numeric" maxLength={13} />
          </Field>
          <Field label="สาขา *">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 py-2 px-3 rounded-xl text-sm border cursor-pointer"
                style={{ borderColor: form.branch_is_head_office ? '#D33F22' : '#e5e7eb' }}>
                <input type="radio" name="branch_choice" checked={form.branch_is_head_office}
                  onChange={() => handleBranchChoice(true)} className="w-4 h-4 shrink-0" />
                สำนักงานใหญ่
              </label>
              <label className="flex items-center gap-2 py-2 px-3 rounded-xl text-sm border cursor-pointer"
                style={{ borderColor: !form.branch_is_head_office ? '#D33F22' : '#e5e7eb' }}>
                <input type="radio" name="branch_choice" checked={!form.branch_is_head_office}
                  onChange={() => handleBranchChoice(false)} className="w-4 h-4 shrink-0" />
                สาขา
              </label>
            </div>
            {!form.branch_is_head_office && (
              <input value={form.branch_number} onChange={e => handleBranchNumberChange(e.target.value)}
                onBlur={e => handleBranchNumberBlur(e.target.value.replace(/[^0-9]/g, ''))}
                className="mt-2 w-full border rounded-xl px-3 py-2 text-sm" placeholder="เลขสาขา 5 หลัก เช่น 00001" inputMode="numeric" maxLength={5} />
            )}
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
          <Field label="อีเมลรับใบกำกับภาษี *">
            <input required type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="you@company.com" />
          </Field>
          <Field label="ยอดก่อน VAT (บาท) *">
            <input required type="number" min="0" step="0.01" value={form.subtotal_baht}
              onChange={e => set('subtotal_baht', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="0.00" />
            <p className="text-[10px] text-gray-400 mt-1">ดูจากบรรทัด &quot;รวมเป็นเงิน&quot; หรือ &quot;Before VAT&quot; บนบิล (ก่อนบวก VAT 7%) — ระบบกรอกให้อัตโนมัติจากรูปบิล กรุณาตรวจสอบอีกครั้ง</p>
          </Field>
          <Field label="ยอดเงินรวมที่ชำระจริง (บาท, รวม VAT) *">
            <input required type="number" min="0" step="0.01" value={form.total_baht}
              onChange={e => set('total_baht', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="0.00" />
            <p className="text-[10px] text-gray-400 mt-1">ยอดที่จ่ายจริงท้ายบิล (หลังปัดเศษ ถ้ามี) — ระบบกรอกให้อัตโนมัติจากรูปบิล กรุณาตรวจสอบอีกครั้ง</p>
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

          <button type="submit" disabled={loading || !form.payment_method || uploadingBill || billOcring}
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
      <ImageLightbox src={lightboxUrl} alt="บิลหรือใบเสร็จ" onClose={() => setLightboxUrl(null)} />
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
