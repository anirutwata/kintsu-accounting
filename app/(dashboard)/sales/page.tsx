'use client'
import { useState, useEffect } from 'react'
import { formatBaht, toSatang, calcGrabNet } from '@/lib/money'
import { getTodayBKK } from '@/lib/utils'
import type { DailySales } from '@/types'

interface POSForm {
  revenue: string
  covers: string
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
  revenue: '', covers: '',
  sales_before_vat: '', vat_amount: '', rounding: '', discount: '',
  cash: '', promptpay: '', company_transfer: '', credit_card: '',
})

export default function SalesPage() {
  const [date, setDate] = useState(getTodayBKK())
  const [existing, setExisting] = useState<DailySales | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

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
        revenue: s.dine_in_revenue_satang ? String(s.dine_in_revenue_satang / 100) : '',
        covers: s.dine_in_covers ? String(s.dine_in_covers) : '',
        sales_before_vat: s.sales_before_vat_satang ? String(s.sales_before_vat_satang / 100) : '',
        vat_amount: s.vat_amount_satang ? String(s.vat_amount_satang / 100) : '',
        rounding: s.rounding_satang ? String(s.rounding_satang / 100) : '',
        discount: s.discount_satang ? String(s.discount_satang / 100) : '',
        cash: s.cash_satang ? String(s.cash_satang / 100) : '',
        promptpay: s.promptpay_satang ? String(s.promptpay_satang / 100) : '',
        company_transfer: s.company_transfer_satang ? String(s.company_transfer_satang / 100) : '',
        credit_card: s.credit_card_satang ? String(s.credit_card_satang / 100) : '',
      })
      setPapaya({
        revenue: s.papaya_revenue_satang ? String(s.papaya_revenue_satang / 100) : '',
        covers: s.papaya_covers ? String(s.papaya_covers) : '',
        sales_before_vat: s.papaya_sales_before_vat_satang ? String(s.papaya_sales_before_vat_satang / 100) : '',
        vat_amount: s.papaya_vat_satang ? String(s.papaya_vat_satang / 100) : '',
        rounding: s.papaya_rounding_satang ? String(s.papaya_rounding_satang / 100) : '',
        discount: s.papaya_discount_satang ? String(s.papaya_discount_satang / 100) : '',
        cash: s.papaya_cash_satang ? String(s.papaya_cash_satang / 100) : '',
        promptpay: s.papaya_promptpay_satang ? String(s.papaya_promptpay_satang / 100) : '',
        company_transfer: s.papaya_company_transfer_satang ? String(s.papaya_company_transfer_satang / 100) : '',
        credit_card: s.papaya_credit_card_satang ? String(s.papaya_credit_card_satang / 100) : '',
      })
      setGrabGrossStr(s.grabfood_gross_satang ? String(s.grabfood_gross_satang / 100) : '')
      setTakeawayStr(s.takeaway_revenue_satang ? String(s.takeaway_revenue_satang / 100) : '')
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

  const foodstoryRev = toSatang(parseFloat(foodstory.revenue) || 0)
  const papayaRev = toSatang(parseFloat(papaya.revenue) || 0)
  const grabGross = toSatang(parseFloat(grabGrossStr) || 0)
  const takeawayRev = toSatang(parseFloat(takeawayStr) || 0)
  const { gpFeeSatang, netSatang: grabNet } = calcGrabNet(grabGross)
  const totalNet = foodstoryRev + papayaRev + grabNet + takeawayRev

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          foodstory: {
            revenue_satang: foodstoryRev,
            covers: parseInt(foodstory.covers) || 0,
            sales_before_vat_satang: toSatang(parseFloat(foodstory.sales_before_vat) || 0),
            vat_satang: toSatang(parseFloat(foodstory.vat_amount) || 0),
            rounding_satang: toSatang(parseFloat(foodstory.rounding) || 0),
            discount_satang: toSatang(parseFloat(foodstory.discount) || 0),
            cash_satang: toSatang(parseFloat(foodstory.cash) || 0),
            promptpay_satang: toSatang(parseFloat(foodstory.promptpay) || 0),
            company_transfer_satang: toSatang(parseFloat(foodstory.company_transfer) || 0),
            credit_card_satang: toSatang(parseFloat(foodstory.credit_card) || 0),
          },
          papaya: {
            revenue_satang: papayaRev,
            covers: parseInt(papaya.covers) || 0,
            sales_before_vat_satang: toSatang(parseFloat(papaya.sales_before_vat) || 0),
            vat_satang: toSatang(parseFloat(papaya.vat_amount) || 0),
            rounding_satang: toSatang(parseFloat(papaya.rounding) || 0),
            discount_satang: toSatang(parseFloat(papaya.discount) || 0),
            cash_satang: toSatang(parseFloat(papaya.cash) || 0),
            promptpay_satang: toSatang(parseFloat(papaya.promptpay) || 0),
            company_transfer_satang: toSatang(parseFloat(papaya.company_transfer) || 0),
            credit_card_satang: toSatang(parseFloat(papaya.credit_card) || 0),
          },
          grabfood: { gross_satang: grabGross, orders: 0, vat_satang: 0 },
          takeaway: { revenue_satang: takeawayRev, orders: parseInt(takeawayOrders) || 0, vat_satang: 0 },
        }),
      })
      if (res.ok) { setSaved(true); loadSales() }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>บันทึกรายรับ</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5" style={{ borderColor: 'var(--border)' }} />
      </div>

      {saved && (
        <div className="p-3 rounded-xl bg-green-50 text-green-700 text-sm font-medium">
          ✅ บันทึกแล้ว
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
              <input type="number" step="1" min="0" value={grabGrossStr}
                onChange={e => setGrabGrossStr(e.target.value)}
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
                <input type="number" step="1" min="0" value={takeawayStr}
                  onChange={e => setTakeawayStr(e.target.value)}
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

function POSSection({ title, logo, accentColor, form, onChange }: {
  title: string
  logo: string
  accentColor: string
  form: POSForm
  onChange: (f: POSForm) => void
}) {
  const set = (key: keyof POSForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value })

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', borderLeft: `4px solid ${accentColor}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={title} className="h-7 w-auto object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <h3 className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{title}</h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Revenue + Covers */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>ยอดขาย (บาท)</label>
            <input type="number" step="1" min="0" value={form.revenue} onChange={set('revenue')}
              className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
              style={{ borderColor: 'var(--border)' }} placeholder="0" />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>จำนวน cover</label>
            <input type="number" min="0" value={form.covers} onChange={set('covers')}
              className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1"
              style={{ borderColor: 'var(--border)' }} placeholder="0" />
          </div>
        </div>

        {/* VAT breakdown */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>รายละเอียด VAT</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ก่อน VAT</label>
              <input type="number" step="0.01" min="0" value={form.sales_before_vat} onChange={set('sales_before_vat')}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>VAT 7%</label>
              <input type="number" step="0.01" min="0" value={form.vat_amount} onChange={set('vat_amount')}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ยอดปัดเศษ (ขึ้น)</label>
              <input type="number" step="0.01" value={form.rounding} onChange={set('rounding')}
                className="w-full border rounded-xl px-3 py-2 text-right money-input mt-1 text-sm"
                style={{ borderColor: 'var(--border)' }} placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ยอดส่วนลด (ติดลบ)</label>
              <input type="number" step="0.01" max="0" value={form.discount} onChange={set('discount')}
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
                <input type="number" step="1" min="0" value={form[key as keyof POSForm]} onChange={set(key as keyof POSForm)}
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
