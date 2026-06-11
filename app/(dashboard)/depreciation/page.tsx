'use client'
import { useState, useEffect } from 'react'
import type { Asset } from '@/types'

function getMonths() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    months.push({ val, label })
  }
  return months
}

function fmt(satang: number) {
  return (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthlyDepSatang(asset: Asset): number {
  return Math.round((asset.purchase_satang - asset.salvage_satang) / asset.useful_life_months)
}

// How many months have elapsed from purchase through selectedMonth (inclusive)
function elapsedMonths(purchaseDate: string, selectedMonth: string): number {
  const [py, pm] = purchaseDate.slice(0, 7).split('-').map(Number)
  const [sy, sm] = selectedMonth.split('-').map(Number)
  return (sy - py) * 12 + (sm - pm) + 1
}

// Accumulated depreciation BEFORE the selected month (i.e. already recorded)
function accDepBeforeSatang(asset: Asset, selectedMonth: string): number {
  const elapsed = elapsedMonths(asset.purchase_date, selectedMonth) - 1
  const capped = Math.min(Math.max(elapsed, 0), asset.useful_life_months)
  return capped * monthlyDepSatang(asset)
}

// Net book value at start of selected month
function nbvStartSatang(asset: Asset, selectedMonth: string): number {
  return Math.max(0, asset.purchase_satang - accDepBeforeSatang(asset, selectedMonth))
}

interface DepRow {
  asset: Asset
  monthly: number   // satang
  elapsed: number
  alreadyDone: boolean
}

export default function DepreciationPage() {
  const months = getMonths()
  const [month, setMonth] = useState(months[0].val)
  const [assets, setAssets] = useState<Asset[]>([])
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      const [assetRes, manualRes] = await Promise.all([
        fetch('/api/assets'),
        fetch(`/api/manual-journal?month=${month}`),
      ])
      const assetData: Asset[] = await assetRes.json()
      const manualData: { id: string; debit_code: string; reference: string }[] = await manualRes.json()

      // Find which asset IDs already have depreciation recorded this month
      const recorded = new Set<string>()
      for (const e of manualData) {
        if (e.debit_code === '5901' && e.reference?.startsWith('dep-')) {
          const assetId = e.reference.replace('dep-', '').replace(/-\d{4}-\d{2}$/, '')
          recorded.add(assetId)
        }
      }
      setRecordedIds(recorded)

      // Active assets in selected month
      const active = (Array.isArray(assetData) ? assetData : []).filter(a => {
        if (!a.is_active) return false
        const purchaseMonth = a.purchase_date.slice(0, 7)
        if (purchaseMonth > month) return false  // not yet purchased
        const elapsed = elapsedMonths(a.purchase_date, month)
        if (elapsed > a.useful_life_months) return false  // fully depreciated
        return true
      })
      setAssets(active)

      // Pre-select all not yet recorded
      const toSelect = new Set(active.filter(a => !recorded.has(a.id)).map(a => a.id))
      setSelected(toSelect)
    } finally {
      setLoading(false)
    }
  }

  async function handleRecord() {
    const toRecord = assets.filter(a => selected.has(a.id) && !recordedIds.has(a.id))
    if (toRecord.length === 0) return

    setSaving(true)
    setError('')
    setSuccessMsg('')

    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const date = `${month}-${String(lastDay).padStart(2, '0')}`  // last day of month

    try {
      let count = 0
      for (const asset of toRecord) {
        const amount_satang = monthlyDepSatang(asset)
        if (amount_satang <= 0) continue
        const res = await fetch('/api/manual-journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            description: `ค่าเสื่อมราคา - ${asset.name}`,
            reference: `dep-${asset.id}-${month}`,
            debit_code: '5901',
            debit_name: 'ค่าเสื่อมราคา',
            credit_code: '1550',
            credit_name: 'ค่าเสื่อมราคาสะสม',
            amount_satang,
          }),
        })
        if (res.ok) count++
      }
      setSuccessMsg(`บันทึกค่าเสื่อมราคาสำเร็จ ${count} รายการ`)
      load()
    } catch {
      setError('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const rows: DepRow[] = assets.map(a => ({
    asset: a,
    monthly: monthlyDepSatang(a),
    elapsed: elapsedMonths(a.purchase_date, month),
    alreadyDone: recordedIds.has(a.id),
  }))

  const totalSelected = rows
    .filter(r => selected.has(r.asset.id) && !r.alreadyDone)
    .reduce((s, r) => s + r.monthly, 0)

  const allDone = rows.length > 0 && rows.every(r => r.alreadyDone)
  const pendingCount = rows.filter(r => !r.alreadyDone).length

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>ค่าเสื่อมราคา</h1>

      <select value={month} onChange={e => setMonth(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}>
        {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
      </select>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
      {successMsg && <p className="text-xs text-green-700 bg-green-50 rounded-xl p-3">{successMsg}</p>}

      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>ไม่มีสินทรัพย์ที่ต้องคิดค่าเสื่อมในเดือนนี้</p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>สินทรัพย์ทั้งหมด</p>
              <p className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{rows.length} รายการ</p>
            </div>
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>ยังไม่บันทึก</p>
              <p className="text-xs font-bold" style={{ color: pendingCount > 0 ? '#991b1b' : '#166534' }}>{pendingCount} รายการ</p>
            </div>
            <div className="bg-white rounded-2xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>ค่าเสื่อมที่เลือก</p>
              <p className="text-xs font-bold" style={{ color: '#9a3412' }}>฿{fmt(totalSelected)}</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="grid px-3 py-2 text-[10px] font-semibold border-b"
              style={{ gridTemplateColumns: '1.5rem 1fr 5rem 5rem', color: 'var(--muted-foreground)', borderColor: 'var(--border)', background: '#f9fafb' }}>
              <span></span>
              <span>สินทรัพย์</span>
              <span className="text-right">เดือนนี้</span>
              <span className="text-right">เดือนที่</span>
            </div>

            {rows.map(r => (
              <div key={r.asset.id} className="grid px-3 py-2.5 border-b items-center text-xs"
                style={{ gridTemplateColumns: '1.5rem 1fr 5rem 5rem', borderColor: 'var(--border)', opacity: r.alreadyDone ? 0.5 : 1 }}>
                <input type="checkbox"
                  checked={selected.has(r.asset.id) && !r.alreadyDone}
                  disabled={r.alreadyDone}
                  onChange={e => setSelected(prev => {
                    const next = new Set(prev)
                    e.target.checked ? next.add(r.asset.id) : next.delete(r.asset.id)
                    return next
                  })}
                  className="accent-[var(--flame-red)]"
                />
                <div className="min-w-0 pr-2">
                  <p className="font-medium truncate" style={{ color: 'var(--charcoal)' }}>{r.asset.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    {r.asset.category}
                    {r.alreadyDone && <span className="ml-1 text-green-600 font-semibold">✓ บันทึกแล้ว</span>}
                  </p>
                </div>
                <p className="text-right font-mono" style={{ color: '#9a3412' }}>฿{fmt(r.monthly)}</p>
                <p className="text-right font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                  {r.elapsed}/{r.asset.useful_life_months}
                </p>
              </div>
            ))}
          </div>

          {/* Action */}
          {!allDone && (
            <button onClick={handleRecord} disabled={saving || totalSelected <= 0}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: saving || totalSelected <= 0 ? '#d1d5db' : 'var(--flame-red)' }}>
              {saving ? 'กำลังบันทึก...' : `บันทึกค่าเสื่อมราคา ฿${fmt(totalSelected)}`}
            </button>
          )}
          {allDone && (
            <div className="rounded-xl p-3 text-center text-xs font-semibold"
              style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
              ✓ บันทึกค่าเสื่อมราคาครบทุกรายการแล้ว
            </div>
          )}
        </>
      )}
    </div>
  )
}
