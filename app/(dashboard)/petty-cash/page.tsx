'use client'
import { useState, useEffect } from 'react'
import { formatBaht, toSatang } from '@/lib/money'
import type { PettyCash, PettyCashTransaction, Shift } from '@/types'

export default function PettyCashPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [selectedShift, setSelectedShift] = useState<string>('')
  const [pettyCash, setPettyCash] = useState<PettyCash | null>(null)
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([])
  const [showTxForm, setShowTxForm] = useState(false)
  const [loading, setLoading] = useState(false)

  const [txForm, setTxForm] = useState({ description: '', amount: '', category: 'ค่าใช้จ่ายทั่วไป' })
  const [openBalance, setOpenBalance] = useState('')

  const TX_CATEGORIES = ['ค่าใช้จ่ายทั่วไป','ค่าอาหารพนักงาน','ค่าขนส่ง','ค่าวัสดุ','อื่นๆ']

  useEffect(() => { loadShifts() }, [])
  useEffect(() => { if (selectedShift) loadPettyCash(selectedShift) }, [selectedShift])

  async function loadShifts() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const res = await fetch(`/api/shifts?date=${today}`)
    const data: Shift[] = await res.json()
    setShifts(data)
    const open = data.find(s => s.status === 'open')
    if (open) setSelectedShift(open.id)
  }

  async function loadPettyCash(shiftId: string) {
    const res = await fetch(`/api/petty-cash?shift_id=${shiftId}`)
    const data: PettyCash[] = await res.json()
    if (data.length > 0) {
      setPettyCash(data[0])
      const txRes = await fetch(`/api/petty-cash/${data[0].id}/transactions`)
      setTransactions(await txRes.json())
    } else {
      setPettyCash(null)
      setTransactions([])
    }
  }

  async function handleOpen() {
    setLoading(true)
    try {
      const res = await fetch('/api/petty-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_id: selectedShift,
          opening_balance_satang: toSatang(parseFloat(openBalance) || 0),
        }),
      })
      if (res.ok) { setOpenBalance(''); loadPettyCash(selectedShift) }
    } finally {
      setLoading(false)
    }
  }

  async function handleAddTx(e: React.FormEvent) {
    e.preventDefault()
    if (!pettyCash) return
    setLoading(true)
    try {
      const res = await fetch(`/api/petty-cash/${pettyCash.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: txForm.description,
          amount_satang: toSatang(parseFloat(txForm.amount) || 0),
          category: txForm.category,
        }),
      })
      if (res.ok) {
        setShowTxForm(false)
        setTxForm({ description: '', amount: '', category: 'ค่าใช้จ่ายทั่วไป' })
        loadPettyCash(selectedShift)
      }
    } finally {
      setLoading(false)
    }
  }

  const remaining = pettyCash
    ? pettyCash.opening_balance_satang - pettyCash.total_expenses_satang
    : 0

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>เงินสดย่อย</h1>

      {/* Shift Selector */}
      {shifts.length > 0 && (
        <select value={selectedShift} onChange={e => setSelectedShift(e.target.value)}
          className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)', background: 'white' }}>
          <option value="">— เลือกกะ —</option>
          {shifts.map(s => (
            <option key={s.id} value={s.id}>
              {s.shift_name} ({s.status === 'open' ? 'เปิดอยู่' : 'ปิดแล้ว'})
            </option>
          ))}
        </select>
      )}

      {selectedShift && !pettyCash && (
        <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--charcoal)' }}>เปิดกองทุนเงินสดย่อย</p>
          <div className="flex gap-2">
            <input type="number" step="0.01" min="0" value={openBalance}
              onChange={e => setOpenBalance(e.target.value)}
              className="flex-1 border rounded-xl px-3 py-2 text-right money-input"
              style={{ borderColor: 'var(--border)' }} placeholder="ยอดเปิด (บาท)" />
            <button onClick={handleOpen} disabled={loading}
              className="px-4 py-2 rounded-xl font-semibold text-white"
              style={{ background: 'var(--flame-red)' }}>เปิด</button>
          </div>
        </div>
      )}

      {pettyCash && (
        <>
          {/* Balance Card */}
          <div className="bg-white rounded-2xl p-5 border-2"
            style={{ borderColor: remaining < 50000 ? '#FCA5A5' : 'var(--flame-red)' }}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>ยอดเปิด</p>
                <p className="font-bold text-base">{formatBaht(pettyCash.opening_balance_satang)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>จ่ายไป</p>
                <p className="font-bold text-base text-red-600">{formatBaht(pettyCash.total_expenses_satang)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>คงเหลือ</p>
                <p className="font-bold text-base" style={{ color: remaining < 50000 ? '#991B1B' : '#065F46' }}>
                  {formatBaht(remaining)}
                </p>
              </div>
            </div>
            {remaining < 50000 && (
              <p className="text-center text-xs text-red-500 mt-2">⚠️ เงินสดย่อยใกล้หมด</p>
            )}
          </div>

          {/* Add Transaction */}
          {pettyCash.status === 'open' && (
            <button onClick={() => setShowTxForm(true)}
              className="w-full py-3 rounded-2xl font-semibold text-white"
              style={{ background: 'var(--flame-red)' }}>
              + บันทึกรายจ่าย
            </button>
          )}

          {/* Transactions */}
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{tx.description}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {tx.category} · {tx.created_by_name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(tx.time).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="font-semibold text-red-600">{formatBaht(tx.amount_satang)}</p>
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีรายการ</div>
            )}
          </div>
        </>
      )}

      {/* Add Transaction Modal */}
      {showTxForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setShowTxForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">บันทึกรายจ่าย</h2>
            <form onSubmit={handleAddTx} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>รายละเอียด *</label>
                <input required type="text" value={txForm.description}
                  onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)' }}
                  placeholder="เช่น ค่าอาหารพนักงาน" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>จำนวนเงิน (บาท) *</label>
                <input required type="number" step="0.01" min="0" value={txForm.amount}
                  onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-right money-input"
                  style={{ borderColor: 'var(--border)' }} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>หมวดหมู่</label>
                <select value={txForm.category} onChange={e => setTxForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                  {TX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowTxForm(false)}
                  className="flex-1 py-2.5 border rounded-xl" style={{ borderColor: 'var(--border)' }}>ยกเลิก</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--flame-red)' }}>บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
