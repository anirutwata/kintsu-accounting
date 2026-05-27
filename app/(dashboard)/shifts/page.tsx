'use client'
import { useState, useEffect } from 'react'
import { formatBaht, DENOMINATIONS, DENOM_LABELS, countDenominations, toSatang } from '@/lib/money'
import { getTodayBKK, getThaiDate } from '@/lib/utils'
import type { Shift } from '@/types'

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(false)
  const [showOpenForm, setShowOpenForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)

  const [openForm, setOpenForm] = useState({ shift_name: 'กะเที่ยง', float: '' })
  const [denoms, setDenoms] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map(d => [d, 0]))
  )

  const today = getTodayBKK()

  useEffect(() => { loadShifts() }, [])

  async function loadShifts() {
    const res = await fetch(`/api/shifts?date=${today}`)
    const data: Shift[] = await res.json()
    setShifts(data)
    setOpenShift(data.find(s => s.status === 'open') || null)
  }

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_name: openForm.shift_name,
          float_satang: toSatang(parseFloat(openForm.float) || 0),
        }),
      })
      if (res.ok) { setShowOpenForm(false); loadShifts() }
    } finally {
      setLoading(false)
    }
  }

  async function handleClose() {
    if (!openShift) return
    setLoading(true)
    try {
      const denomsRecord = Object.fromEntries(
        Object.entries(denoms).map(([k, v]) => [k, v])
      )
      const res = await fetch(`/api/shifts/${openShift.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denominations: denomsRecord }),
      })
      if (res.ok) { setShowCloseForm(false); loadShifts() }
    } finally {
      setLoading(false)
    }
  }

  const closingTotal = countDenominations(
    Object.fromEntries(Object.entries(denoms).map(([k, v]) => [k, v]))
  )

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>จัดการกะ</h1>
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{getThaiDate(today)}</p>

      {/* Active Shift */}
      {openShift ? (
        <div className="bg-white rounded-2xl p-5 border-2" style={{ borderColor: 'var(--flame-red)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-bold" style={{ color: 'var(--charcoal)' }}>{openShift.shift_name}</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                เปิดตั้งแต่ {new Date(openShift.opened_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <span className="badge-open text-xs px-2 py-1 rounded-full">เปิดอยู่</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--muted-foreground)' }}>เงินทอนเริ่มต้น</span>
            <span className="font-semibold">{formatBaht(openShift.float_satang)}</span>
          </div>
          <button onClick={() => setShowCloseForm(true)}
            className="w-full mt-4 py-2.5 rounded-xl font-semibold text-white"
            style={{ background: 'var(--flame-red-dark)' }}>
            ปิดกะ
          </button>
        </div>
      ) : (
        <button onClick={() => setShowOpenForm(true)}
          className="w-full py-3 rounded-2xl font-semibold text-white"
          style={{ background: 'var(--flame-red)' }}>
          + เปิดกะใหม่
        </button>
      )}

      {/* Today's Shifts History */}
      <div className="space-y-2">
        {shifts.filter(s => s.status === 'closed').map(shift => (
          <div key={shift.id} className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{shift.shift_name}</p>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {new Date(shift.opened_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}
                  {' → '}
                  {shift.closed_at && new Date(shift.closed_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="text-right">
                <span className="badge-closed text-xs px-2 py-1 rounded-full">ปิดแล้ว</span>
                {shift.cash_variance_satang !== null && (
                  <p className={`text-xs mt-1 font-medium ${shift.cash_variance_satang >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ผลต่าง: {shift.cash_variance_satang >= 0 ? '+' : ''}{formatBaht(shift.cash_variance_satang)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Open Shift Modal */}
      {showOpenForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setShowOpenForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">เปิดกะใหม่</h2>
            <form onSubmit={handleOpen} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อกะ</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {['กะเช้า','กะเที่ยง','กะเย็น'].map(n => (
                    <button key={n} type="button" onClick={() => setOpenForm(f => ({ ...f, shift_name: n }))}
                      className="py-2 rounded-xl border text-sm font-medium transition-colors"
                      style={{
                        borderColor: openForm.shift_name === n ? 'var(--flame-red)' : 'var(--border)',
                        background: openForm.shift_name === n ? '#FEF2F2' : 'white',
                        color: openForm.shift_name === n ? 'var(--flame-red)' : 'var(--charcoal)',
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
                <input type="text" value={openForm.shift_name}
                  onChange={e => setOpenForm(f => ({ ...f, shift_name: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)' }}
                  placeholder="หรือพิมพ์ชื่อกะเอง" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  เงินทอนเริ่มต้น (บาท)
                </label>
                <input type="number" step="0.01" min="0" value={openForm.float}
                  onChange={e => setOpenForm(f => ({ ...f, float: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-right money-input"
                  style={{ borderColor: 'var(--border)' }} placeholder="0.00" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowOpenForm(false)}
                  className="flex-1 py-2.5 border rounded-xl" style={{ borderColor: 'var(--border)' }}>ยกเลิก</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white"
                  style={{ background: 'var(--flame-red)' }}>เปิดกะ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Shift Modal — Denomination Counter */}
      {showCloseForm && openShift && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCloseForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-1">ปิดกะ — {openShift.shift_name}</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>นับเงินสดแยกตามธนบัตร/เหรียญ</p>

            <div className="space-y-2 mb-4">
              {DENOMINATIONS.map(d => (
                <div key={d} className="flex items-center justify-between">
                  <span className="text-sm font-medium w-16">{DENOM_LABELS[d]}</span>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => setDenoms(prev => ({ ...prev, [d]: Math.max(0, (prev[d] || 0) - 1) }))}
                      className="w-8 h-8 rounded-lg border text-lg font-bold flex items-center justify-center"
                      style={{ borderColor: 'var(--border)' }}>−</button>
                    <input type="number" min="0" value={denoms[d] || 0}
                      onChange={e => setDenoms(prev => ({ ...prev, [d]: parseInt(e.target.value) || 0 }))}
                      className="w-16 border rounded-lg px-2 py-1 text-center text-sm"
                      style={{ borderColor: 'var(--border)' }} />
                    <button type="button"
                      onClick={() => setDenoms(prev => ({ ...prev, [d]: (prev[d] || 0) + 1 }))}
                      className="w-8 h-8 rounded-lg border text-lg font-bold flex items-center justify-center"
                      style={{ borderColor: 'var(--border)' }}>+</button>
                    <span className="text-xs w-20 text-right" style={{ color: 'var(--muted-foreground)' }}>
                      = {formatBaht(d * (denoms[d] || 0))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl mb-4" style={{ background: 'var(--muted)' }}>
              <div className="flex justify-between font-bold">
                <span>ยอดรวมที่นับได้</span>
                <span style={{ color: 'var(--flame-red)' }}>{formatBaht(closingTotal)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowCloseForm(false)}
                className="flex-1 py-2.5 border rounded-xl" style={{ borderColor: 'var(--border)' }}>ยกเลิก</button>
              <button onClick={handleClose} disabled={loading}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--flame-red-dark)' }}>
                {loading ? 'กำลังปิดกะ...' : 'ยืนยันปิดกะ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
