'use client'
import { useState, useEffect } from 'react'
import { formatBaht, toSatang, calcGrabNet, fmtInput, parseInput } from '@/lib/money'
import { getTodayBKK } from '@/lib/utils'
import type { DailySales } from '@/types'

interface POSForm {
  revenue: string
  covers: string
  bills: string
  sales_before_vat: string
  vat_amount: string
  rounding: string
  discount: string
  cash: string
  promptpay: string
  company_transfer: string
  credit_card: string
}

const emptyPOS = (): POSForm => ({
  revenue: '', covers: '', bills: '',
  sales_before_vat: '', vat_amount: '', rounding: '', discount: '',
  cash: '', promptpay: '', company_transfer: '', credit_card: '',
})

function getClientRole() {
  if (typeof document === 'undefined') return ''
  return document.cookie.match(/kintsu_acc_role=([^;]+)/)?.[1] ?? ''
}

export default function SalesPage() {
  const today = getTodayBKK()
  const [date, setDate] = useState(today)
  const [existing, setExisting] = useState<DailySales | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [role, setRole] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { setRole(getClientRole()) }, [])

  const [foodstory, setFoodstory] = useState<POSForm>(emptyPOS())
  const [papaya, setPapaya] = useState<POSForm>(emptyPOS())
  const [grabGrossStr, setGrabGrossStr] = useState('')
  const [takeawayStr, setTakeawayStr] = useState('')
  const [takeawayOrders, setTakeawayOrders] = useState('')

  useEffect(() => { loadSales() }, [date])

  async function loadSales() {
    const res = await fetch(`/api/sales?date=${date}`)
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const s = data[0] as DailySales
      setExisting(s)
      setFoodstory({
        revenue: s.dine_in_revenue_satang ? fmtInput(s.dine_in_revenue_satang) : '',
        covers: s.dine_in_covers ? String(s.dine_in_covers) : '',
        bills: s.dine_in_bills ? String(s.dine_in_bills) : '',
        sales_before_vat: s.sales_before_vat_satang ? fmtInput(s.sales_before_vat_satang) : '',
        vat_amount: s.vat_amount_satang ? fmtInput(s.vat_amount_satang) : '',
        rounding: s.rounding_satang ? fmtInput(s.rounding_satang) : '',
        discount: s.discount_satang ? fmtInput(s.discount_satang) : '',
        cash: s.cash_satang ? fmtInput(s.cash_satang) : '',
        promptpay: s.promptpay_satang ? fmtInput(s.promptpay_satang) : '',
        company_transfer: s.company_transfer_satang ? fmtInput(s.company_transfer_satang) : '',
        credit_card: s.credit_card_satang ? fmtInput(s.credit_card_satang) : '',
      })
      setPapaya({
        revenue: s.papaya_revenue_satang ? fmtInput(s.papaya_revenue_satang) : '',
        covers: s.papaya_covers ? String(s.papaya_covers) : '',
        bills: s.papaya_bills ? String(s.papaya_bills) : '',
        sales_before_vat: s.papaya_sales_before_vat_satang ? fmtInput(s.papaya_sales_before_vat_satang) : '',
        vat_amount: s.papaya_vat_satang ? fmtInput(s.papaya_vat_satang) : '',
        rounding: s.papaya_rounding_satang ? fmtInput(s.papaya_rounding_satang) : '',
        discount: s.papaya_discount_satang ? fmtInput(s.papaya_discount_satang) : '',
        cash: s.papaya_cash_satang ? fmtInput(s.papaya_cash_satang) : '',
        promptpay: s.papaya_promptpay_satang ? fmtInput(s.papaya_promptpay_satang) : '',
        company_transfer: s.papaya_company_transfer_satang ? fmtInput(s.papaya_company_transfer_satang) : '',
        credit_card: s.papaya_credit_card_satang ? fmtInput(s.papaya_credit_card_satang) : '',
      })
      setGrabGrossStr(s.grabfood_gross_satang ? fmtInput(s.grabfood_gross_satang) : '')
      setTakeawayStr(s.takeaway_revenue_satang ? fmtInput(s.takeaway_revenue_satang) : '')
      setTakeawayOrders(s.takeaway_orders ? String(s.takeaway_orders) : '')
    } else {
      setExisting(null)
      setFoodstory(emptyPOS())
      setPapaya(emptyPOS())
      setGrabGrossStr('')
      setTakeawayStr('')
      setTakeawayOrders('')
    }
    setSaved(false)
  }

  const foodstoryRev = toSatang(parseInput(foodstory.revenue))
  const papayaRev = toSatang(parseInput(papaya.revenue))
  const grabGross = toSatang(parseInput(grabGrossStr))
  const takeawayRev = toSatang(parseInput(takeawayStr))
  const { gpFeeSatang, netSatang: grabNet } = calcGrabNet(grabGross)
  const totalNet = foodstoryRev + papayaRev + grabNet + takeawayRev

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    const res = await fetch(`/api/sales/${date}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(false)
      loadSales()
    } else {
      const err = await res.json()
      setDeleteError(err.error || 'ลบไม่สำเร็จ')
    }
    setDeleting(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSaveError('')
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          foodstory: {
            revenue_satang: foodstoryRev,
            covers: parseInt(foodstory.covers) || 0,
            bills: parseInt(foodstory.bills) || 0,
            sales_before_vat_satang: toSatang(parseInput(foodstory.sales_before_vat)),
            vat_satang: toSatang(parseInput(foodstory.vat_amount)),
            rounding_satang: toSatang(parseInput(foodstory.rounding)),
            discount_satang: toSatang(parseInput(foodstory.discount)),
            cash_satang: toSatang(parseInput(foodstory.cash)),
            promptpay_satang: toSatang(parseInput(foodstory.promptpay)),
            company_transfer_satang: toSatang(parseInput(foodstory.company_transfer)),
            credit_card_satang: toSatang(parseInput(foodstory.credit_card)),
          },
          papaya: {
            revenue_satang: papayaRev,
            covers: parseInt(papaya.covers) || 0,
            bills: parseInt(papaya.bills) || 0,
            sales_before_vat_satang: toSatang(parseInput(papaya.sales_before_vat)),
            vat_satang: toSatang(parseInput(papaya.vat_amount)),
            rounding_satang: toSatang(parseInput(papaya.rounding)),
            discount_satang: toSatang(parseInput(papaya.discount)),
            cash_satang: toSatang(parseInput(papaya.cash)),
            promptpay_satang: toSatang(parseInput(papaya.promptpay)),
            company_transfer_satang: toSatang(parseInput(papaya.company_transfer)),
            credit_card_satang: toSatang(parseInput(papaya.credit_card)),
          },
          grabfood: { gross_satang: grabGross, orders: 0, vat_satang: 0 },
          takeaway: { revenue_satang: takeawayRev, orders: parseInt(takeawayOrders) || 0, vat_satang: 0 },
        }),
      })
      if (res.ok) {
        setSaved(true)
        loadSales()
      } else {
        const err = await res.json()
        setSaveError(err.error || 'บันทึกไม่สำเร็จ')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>บันทึกรายรับ</h1>
        {role === 'cashier' ? (
          <span className="text-sm px-2 py-1.5 rounded-lg" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
            {new Date(today).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        ) : (
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="text-sm border rounded-lg px-2 py-1.5" style={{ borderColor: 'var(--border)' }} />
        )}
      </div>

      {saved && (
        <div className="p-3 rounded-xl bg-green-50 text-green-700 text-sm font-medium">
          ✅ บันทึกแล้ว
        </div>
      )}
      {saveError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          ❌ {saveError}
        </div>
      )}
      {deleteError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm flex justify-between">
          <span>❌ {deleteError}</span>
          <button onClick={() => setDeleteError('')} className="text-red-400 ml-2">✕</button>
        </div>
      )}

      {role === 'owner' && existing && (
        <div className="flex justify-end">
          {deleteConfirm ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-red-600">ยืนยันลบข้อมูลวันนี้?</span>
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#DC2626' }}>
                {deleting ? '...' : 'ลบ'}
              </button>
              <button onClick={() => { setDeleteConfirm(false); setDeleteError('') }}
                className="px-3 py-1.5 rounded-xl text-xs border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                ยกเลิก
              </button>
            </div>
          ) : (
            <button onClick={() => setDeleteConfirm(true)}
              className="px-3 py-1.5 rounded-xl text-xs text-red-500 border" style={{ borderColor: 'var(--border)' }}>
              ลบข้อมูลวันนี้
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Foodstory POS */}
        <POSSection
          title="Foodstory POS"
          logo="/logos/foodstory_logo.png"
          accentColor="#D33F22"
          form={foodstory}
          onChange={setFoodstory}
        />

        {/* Papaya POS */}
        <POSSection
          title="Papaya POS"
          logo="/logos/papaya_logo.png"
          accentColor="#16A34A"
          form={papaya}
          onChange={setPapaya}
        />

        {/* GrabFood */}
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', borderLeft: '4px solid #9F8966' }}>
            <span className="text-xl">🛵</span>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>GrabFood Delivery</h3>
          </div>
          <div className="p-4">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>ยอดขาย Gross (บาท)</label>
              <input type="text" inputMode="decimal" value={grabGrossStr}
                onChange={e => setGrabGrossStr(e.target.value)}
                onBlur={() => setGrabGrossStr(fmtMoneyVal(grabGrossStr))}
                onFocus={() => setGrabGrossStr(grabGrossStr.replace(/,/g, ''))}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            {grabGross > 0 && (
              <div className="mt-2 p-2 rounded-lg text-xs space-y-1" style={{ background: 'var(--muted)' }}>
                <p className="text-red-600">Grab GP -30%: ({formatBaht(gpFeeSatang)})</p>
                <p className="font-medium" style={{ color: 'var(--charcoal)' }}>ยอดสุทธิ: {formatBaht(grabNet)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Takeaway */}
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', borderLeft: '4px solid #9D1F14' }}>
            <span className="text-xl">🥡</span>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>กลับบ้าน (Takeaway)</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>ยอดขาย (บาท)</label>
                <input type="text" inputMode="decimal" value={takeawayStr}
                  onChange={e => setTakeawayStr(e.target.value)}
                  onBlur={() => setTakeawayStr(fmtMoneyVal(takeawayStr))}
                  onFocus={() => setTakeawayStr(takeawayStr.replace(/,/g, ''))}
                  className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
                  style={{ borderColor: 'var(--border)' }} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>จำนวน order</label>
                <input type="number" min="0" value={takeawayOrders}
                  onChange={e => setTakeawayOrders(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
                  style={{ borderColor: 'var(--border)' }} placeholder="0" />
              </div>
            </div>
          </div>
        </div>

        {/* Total */}
        {totalNet > 0 && (
          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>รายได้สุทธิรวม</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--flame-red)' }}>{formatBaht(totalNet)}</p>
            {(foodstoryRev > 0 || papayaRev > 0) && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {foodstoryRev > 0 && <span>Foodstory: {formatBaht(foodstoryRev)}</span>}
                {papayaRev > 0 && <span>Papaya: {formatBaht(papayaRev)}</span>}
                {grabNet > 0 && <span>Grab (net): {formatBaht(grabNet)}</span>}
                {takeawayRev > 0 && <span>Takeaway: {formatBaht(takeawayRev)}</span>}
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--flame-red)' }}>
          {loading ? 'กำลังบันทึก...' : existing ? 'อัปเดตรายรับ' : 'บันทึกรายรับ'}
        </button>
      </form>
    </div>
  )
}

const PAYMENT_CHANNELS = [
  { key: 'cash', label: 'เงินสด', icon: '💵' },
  { key: 'promptpay', label: 'พร้อมเพย์', icon: '📱' },
  { key: 'company_transfer', label: 'โอน (บริษัท)', icon: '🏦' },
  { key: 'credit_card', label: 'บัตรเครดิต', icon: '💳' },
]

function fmtMoneyVal(val: string): string {
  const num = parseFloat(val.replace(/,/g, ''))
  if (!val || isNaN(num)) return val
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function POSSection({ title, logo, accentColor, form, onChange }: {
  title: string
  logo: string
  accentColor: string
  form: POSForm
  onChange: (f: POSForm) => void
}) {
  const set = (key: keyof POSForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value })

  const fmt = (key: keyof POSForm) => () =>
    onChange({ ...form, [key]: fmtMoneyVal(form[key]) })

  const strip = (key: keyof POSForm) => () =>
    onChange({ ...form, [key]: form[key].replace(/,/g, '') })

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', borderLeft: `4px solid ${accentColor}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={title} className="object-contain"
          style={{ width: 28, height: 28 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <h3 className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{title}</h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Revenue */}
        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>ยอดขาย (บาท)</label>
          <input type="text" inputMode="decimal" value={form.revenue} onChange={set('revenue')} onBlur={fmt('revenue')} onFocus={strip('revenue')}
            className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
            style={{ borderColor: 'var(--border)' }} placeholder="0" />
        </div>
        {/* Bills */}
        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>จำนวนบิล</label>
          <input type="number" min="0" value={form.bills} onChange={set('bills')}
            className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
            style={{ borderColor: 'var(--border)' }} placeholder="0" />
        </div>

        {/* VAT breakdown */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>รายละเอียด VAT</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ยอดขายก่อน VAT</label>
              <input type="text" inputMode="decimal" value={form.sales_before_vat} onChange={set('sales_before_vat')} onBlur={fmt('sales_before_vat')} onFocus={strip('sales_before_vat')}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>VAT 7%</label>
              <input type="text" inputMode="decimal" value={form.vat_amount} onChange={set('vat_amount')} onBlur={fmt('vat_amount')} onFocus={strip('vat_amount')}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ยอดปัดเศษ (ขึ้น)</label>
              <input type="text" inputMode="decimal" value={form.rounding} onChange={set('rounding')} onBlur={fmt('rounding')} onFocus={strip('rounding')}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ยอดส่วนลด (ติดลบ)</label>
              <input type="text" inputMode="decimal" value={form.discount} onChange={set('discount')} onBlur={fmt('discount')} onFocus={strip('discount')}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm text-red-600"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
          </div>
        </div>

        {/* Payment channels */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>ช่องทางชำระเงิน</p>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_CHANNELS.map(({ key, label, icon }) => (
              <div key={key}>
                <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{icon} {label}</label>
                <input type="text" inputMode="decimal" value={form[key as keyof POSForm]} onChange={set(key as keyof POSForm)} onBlur={fmt(key as keyof POSForm)} onFocus={strip(key as keyof POSForm)}
                  className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm"
                  style={{ borderColor: 'var(--border)' }} placeholder="0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
