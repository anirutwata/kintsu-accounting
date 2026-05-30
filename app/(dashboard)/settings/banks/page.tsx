'use client'
import { useState, useEffect } from 'react'
import type { BankAccount } from '@/types'

const BANKS = ['กสิกรไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย', 'ทหารไทยธนชาต', 'กรุงศรีอยุธยา', 'ออมสิน', 'อาคารสงเคราะห์', 'อื่นๆ']

interface FormState { bank_name: string; account_number: string; account_name: string }
const emptyForm = (): FormState => ({ bank_name: BANKS[0], account_number: '', account_name: '' })

export default function BanksPage() {
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBank, setEditBank] = useState<BankAccount | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/bank-accounts?all=true')
    const data = await res.json()
    setBanks(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function openAdd() {
    setEditBank(null)
    setForm(emptyForm())
    setSaveError('')
    setShowForm(true)
  }

  function openEdit(bank: BankAccount) {
    setEditBank(bank)
    setForm({ bank_name: bank.bank_name, account_number: bank.account_number, account_name: bank.account_name })
    setSaveError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    const url = editBank ? `/api/bank-accounts/${editBank.id}` : '/api/bank-accounts'
    const method = editBank ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (res.ok) {
      setShowForm(false)
      load()
    } else {
      const err = await res.json()
      setSaveError(err.error || 'เกิดข้อผิดพลาด')
    }
    setSaving(false)
  }

  async function toggleActive(bank: BankAccount) {
    const res = await fetch(`/api/bank-accounts/${bank.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !bank.is_active }),
    })
    if (res.ok) load()
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    setDeleteError('')
    const res = await fetch(`/api/bank-accounts/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      load()
    } else {
      const err = await res.json()
      setDeleteError(err.error || 'ลบไม่สำเร็จ')
    }
    setDeleting(false)
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>บัญชีธนาคาร</h1>
        <button onClick={openAdd}
          className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--flame-red)' }}>
          + เพิ่มบัญชี
        </button>
      </div>

      {deleteError && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm flex justify-between">
          <span>❌ {deleteError}</span>
          <button onClick={() => setDeleteError('')} className="text-red-400 ml-2">✕</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
      ) : banks.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-gray-400 text-sm">ยังไม่มีบัญชีธนาคาร</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banks.map(bank => (
            <div key={bank.id} className="bg-white rounded-2xl border overflow-hidden"
              style={{ borderColor: 'var(--border)', opacity: bank.is_active ? 1 : 0.6 }}>
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{bank.bank_name}</p>
                    {!bank.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">ปิดใช้งาน</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{bank.account_number}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{bank.account_name}</p>
                </div>
                <button onClick={() => openEdit(bank)} className="text-xs px-2 py-1 rounded-lg border"
                  style={{ borderColor: 'var(--border)', color: 'var(--charcoal)' }}>แก้ไข</button>
              </div>

              <div className="flex border-t" style={{ borderColor: 'var(--border)' }}>
                <button onClick={() => toggleActive(bank)} className="flex-1 py-2 text-xs"
                  style={{ color: bank.is_active ? '#6B7280' : '#16A34A' }}>
                  {bank.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </button>
                {deleteConfirm === bank.id ? (
                  <>
                    <button onClick={() => handleDelete(bank.id)} disabled={deleting}
                      className="flex-1 py-2 text-xs text-red-600 font-semibold border-l disabled:opacity-50"
                      style={{ borderColor: 'var(--border)' }}>
                      {deleting ? '...' : 'ยืนยันลบ'}
                    </button>
                    <button onClick={() => { setDeleteConfirm(null); setDeleteError('') }}
                      className="flex-1 py-2 text-xs border-l"
                      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>ยกเลิก</button>
                  </>
                ) : (
                  <button onClick={() => { setDeleteConfirm(bank.id); setDeleteError('') }}
                    className="flex-1 py-2 text-xs text-red-500 border-l" style={{ borderColor: 'var(--border)' }}>ลบ</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-2xl mx-auto bg-white rounded-t-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--charcoal)' }}>{editBank ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีธนาคาร'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              {saveError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">❌ {saveError}</div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ธนาคาร</label>
                <select value={form.bank_name} onChange={set('bank_name')}
                  className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>เลขบัญชี</label>
                <input value={form.account_number} onChange={set('account_number')} required
                  className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} placeholder="xxx-x-xxxxx-x" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ชื่อบัญชี</label>
                <input value={form.account_name} onChange={set('account_name')} required
                  className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} placeholder="ชื่อเจ้าของบัญชี" />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--flame-red)' }}>
                {saving ? 'กำลังบันทึก...' : editBank ? 'บันทึกการแก้ไข' : 'เพิ่มบัญชี'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
