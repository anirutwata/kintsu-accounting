'use client'
import { useState, useEffect } from 'react'
import { formatBaht, toSatang } from '@/lib/money'
import type { Asset } from '@/types'

const ASSET_CATEGORIES = [
  { name: 'ส่วนต่อเติมอาคาร', defaultMonths: 180 },
  { name: 'อุปกรณ์ครัว', defaultMonths: 84 },
  { name: 'อุปกรณ์ทั่วไปในร้านอาหาร', defaultMonths: 60 },
  { name: 'ระบบ', defaultMonths: 48 },
  { name: 'สินทรัพย์อื่นๆ', defaultMonths: 60 },
]

function monthlyDep(asset: Asset) {
  return Math.round((asset.purchase_satang - asset.salvage_satang) / asset.useful_life_months)
}

function nbv(asset: Asset) {
  const today = new Date()
  const pd = new Date(asset.purchase_date)
  const elapsed = (today.getFullYear() - pd.getFullYear()) * 12 + (today.getMonth() - pd.getMonth())
  const accDep = Math.min(elapsed, asset.useful_life_months) * monthlyDep(asset)
  return Math.max(0, asset.purchase_satang - asset.salvage_satang - accDep) + asset.salvage_satang
}

function remainingMonths(asset: Asset) {
  const today = new Date()
  const pd = new Date(asset.purchase_date)
  const elapsed = (today.getFullYear() - pd.getFullYear()) * 12 + (today.getMonth() - pd.getMonth())
  return Math.max(0, asset.useful_life_months - elapsed)
}

interface FormState {
  name: string
  category: string
  purchase_date: string
  purchase_amount: string
  salvage_amount: string
  useful_life_months: string
  description: string
}

function emptyForm(): FormState {
  return {
    name: '', category: ASSET_CATEGORIES[0].name,
    purchase_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
    purchase_amount: '', salvage_amount: '0', useful_life_months: '60', description: '',
  }
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/assets')
    setAssets(await res.json())
    setLoading(false)
  }

  function openAdd() {
    setEditAsset(null)
    setForm(emptyForm())
    setSaveError('')
    setShowForm(true)
  }

  function openEdit(asset: Asset) {
    setEditAsset(asset)
    setSaveError('')
    setForm({
      name: asset.name,
      category: asset.category,
      purchase_date: asset.purchase_date,
      purchase_amount: String(asset.purchase_satang / 100),
      salvage_amount: String(asset.salvage_satang / 100),
      useful_life_months: String(asset.useful_life_months),
      description: asset.description || '',
    })
    setShowForm(true)
  }

  function handleCategoryChange(cat: string) {
    const def = ASSET_CATEGORIES.find(c => c.name === cat)
    setForm(f => ({ ...f, category: cat, useful_life_months: String(def?.defaultMonths || 60) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: form.category,
      purchase_date: form.purchase_date,
      purchase_satang: toSatang(parseFloat(form.purchase_amount) || 0),
      salvage_satang: toSatang(parseFloat(form.salvage_amount) || 0),
      useful_life_months: parseInt(form.useful_life_months) || 60,
      description: form.description.trim() || null,
    }
    const url = editAsset ? `/api/assets/${editAsset.id}` : '/api/assets'
    const method = editAsset ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) {
      setShowForm(false)
      load()
    } else {
      const err = await res.json()
      setSaveError(err.error || 'บันทึกไม่สำเร็จ')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    setDeleteError('')
    const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      load()
    } else {
      const err = await res.json()
      setDeleteError(err.error || 'ลบไม่สำเร็จ')
    }
    setDeleting(false)
  }

  async function toggleActive(asset: Asset) {
    await fetch(`/api/assets/${asset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !asset.is_active }),
    })
    load()
  }

  const activeAssets = assets.filter(a => a.is_active)
  const inactiveAssets = assets.filter(a => !a.is_active)
  const totalMonthlyDep = activeAssets.reduce((s, a) => s + monthlyDep(a), 0)
  const totalNBV = activeAssets.reduce((s, a) => s + nbv(a), 0)
  const totalCost = activeAssets.reduce((s, a) => s + a.purchase_satang, 0)

  return (
    <div className="space-y-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>สินทรัพย์</h1>
        <button onClick={openAdd}
          className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--flame-red)' }}>
          + เพิ่มสินทรัพย์
        </button>
      </div>

      {deleteError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm flex justify-between">
          <span>❌ {deleteError}</span>
          <button onClick={() => setDeleteError('')} className="text-red-400 ml-2">✕</button>
        </div>
      )}

      {/* Summary cards */}
      {activeAssets.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'มูลค่าทรัพย์สินรวม', value: formatBaht(totalCost) },
            { label: 'มูลค่าสุทธิ (NBV)', value: formatBaht(totalNBV) },
            { label: 'ค่าเสื่อม/เดือน', value: formatBaht(totalMonthlyDep) },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border p-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] leading-tight mb-1" style={{ color: 'var(--muted-foreground)' }}>{c.label}</p>
              <p className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Asset list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-gray-400 text-sm">ยังไม่มีสินทรัพย์</p>
          <button onClick={openAdd} className="mt-3 text-sm font-medium" style={{ color: 'var(--flame-red)' }}>
            + เพิ่มสินทรัพย์แรก
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {[...activeAssets, ...inactiveAssets].map(asset => {
            const dep = monthlyDep(asset)
            const rem = remainingMonths(asset)
            const bookVal = nbv(asset)
            const isFullyDep = rem === 0
            return (
              <div key={asset.id} className="bg-white rounded-2xl border overflow-hidden"
                style={{ borderColor: 'var(--border)', opacity: asset.is_active ? 1 : 0.6 }}>
                <div className="flex items-start justify-between p-4 pb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{asset.name}</p>
                      {!asset.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">หยุดใช้งาน</span>
                      )}
                      {isFullyDep && asset.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">เสื่อมหมดแล้ว</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {asset.category} · ซื้อ {new Date(asset.purchase_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {asset.description && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{asset.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    <button onClick={() => openEdit(asset)} className="text-xs px-2 py-1 rounded-lg border"
                      style={{ borderColor: 'var(--border)', color: 'var(--charcoal)' }}>แก้ไข</button>
                  </div>
                </div>

                <div className="grid grid-cols-3 border-t text-center" style={{ borderColor: 'var(--border)' }}>
                  <div className="py-2 border-r" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>ราคาทุน</p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>{formatBaht(asset.purchase_satang)}</p>
                  </div>
                  <div className="py-2 border-r" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>มูลค่าสุทธิ</p>
                    <p className="text-xs font-semibold" style={{ color: isFullyDep ? '#9F8966' : 'var(--charcoal)' }}>{formatBaht(bookVal)}</p>
                  </div>
                  <div className="py-2">
                    <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{isFullyDep ? 'อายุใช้งาน' : 'เสื่อม/เดือน'}</p>
                    <p className="text-xs font-semibold" style={{ color: isFullyDep ? '#9F8966' : 'var(--flame-red)' }}>
                      {isFullyDep ? `${asset.useful_life_months} เดือน` : formatBaht(dep)}
                    </p>
                  </div>
                </div>

                {!isFullyDep && asset.is_active && (
                  <div className="px-4 pb-3 pt-2">
                    <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>
                      <span>เหลือ {rem} เดือน</span>
                      <span>{Math.round(((asset.useful_life_months - rem) / asset.useful_life_months) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${((asset.useful_life_months - rem) / asset.useful_life_months) * 100}%`, background: 'var(--flame-red)' }} />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex border-t" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => toggleActive(asset)}
                    className="flex-1 py-2 text-xs"
                    style={{ color: asset.is_active ? '#6B7280' : '#16A34A' }}>
                    {asset.is_active ? 'หยุดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                  {deleteConfirm === asset.id ? (
                    <>
                      <button onClick={() => handleDelete(asset.id)} disabled={deleting}
                        className="flex-1 py-2 text-xs text-red-600 font-semibold border-l disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>
                        {deleting ? '...' : 'ยืนยันลบ'}
                      </button>
                      <button onClick={() => { setDeleteConfirm(null); setDeleteError('') }}
                        className="flex-1 py-2 text-xs border-l" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setDeleteConfirm(asset.id); setDeleteError('') }}
                      className="flex-1 py-2 text-xs text-red-500 border-l" style={{ borderColor: 'var(--border)' }}>
                      ลบ
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-2xl mx-auto bg-white rounded-t-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--charcoal)' }}>
                {editAsset ? 'แก้ไขสินทรัพย์' : 'เพิ่มสินทรัพย์'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {saveError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">❌ {saveError}</div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อสินทรัพย์</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น ตู้แช่เย็น Daikin 2 ประตู" />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>หมวดหมู่</label>
                <select value={form.category} onChange={e => handleCategoryChange(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  {ASSET_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>วันที่ซื้อ</label>
                <input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                  required className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ราคาทุน (บาท)</label>
                  <input type="number" min="0" step="1" value={form.purchase_amount}
                    onChange={e => setForm(f => ({ ...f, purchase_amount: e.target.value }))}
                    required className="w-full border rounded-xl px-3 py-2 text-sm text-right" style={{ borderColor: 'var(--border)' }} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>มูลค่าซาก (บาท)</label>
                  <input type="number" min="0" step="1" value={form.salvage_amount}
                    onChange={e => setForm(f => ({ ...f, salvage_amount: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm text-right" style={{ borderColor: 'var(--border)' }} placeholder="0" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  อายุใช้งาน (เดือน)
                  {form.useful_life_months && (
                    <span className="ml-2 font-normal">= {Math.round(parseInt(form.useful_life_months) / 12 * 10) / 10} ปี</span>
                  )}
                </label>
                <input type="number" min="1" value={form.useful_life_months}
                  onChange={e => setForm(f => ({ ...f, useful_life_months: e.target.value }))}
                  required className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* Preview depreciation */}
              {form.purchase_amount && form.useful_life_months && (
                <div className="p-3 rounded-xl text-sm space-y-1" style={{ background: 'var(--muted)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>ตัวอย่างค่าเสื่อมราคา</p>
                  {(() => {
                    const cost = toSatang(parseFloat(form.purchase_amount) || 0)
                    const salvage = toSatang(parseFloat(form.salvage_amount) || 0)
                    const months = parseInt(form.useful_life_months) || 60
                    const monthly = Math.round((cost - salvage) / months)
                    const yearly = monthly * 12
                    return (
                      <>
                        <div className="flex justify-between text-xs">
                          <span style={{ color: 'var(--muted-foreground)' }}>ค่าเสื่อม/เดือน</span>
                          <span className="font-medium" style={{ color: 'var(--flame-red)' }}>{formatBaht(monthly)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span style={{ color: 'var(--muted-foreground)' }}>ค่าเสื่อม/ปี</span>
                          <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{formatBaht(yearly)}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>หมายเหตุ</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}
                  placeholder="ไม่บังคับ" />
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--flame-red)' }}>
                {saving ? 'กำลังบันทึก...' : editAsset ? 'บันทึกการแก้ไข' : 'เพิ่มสินทรัพย์'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
