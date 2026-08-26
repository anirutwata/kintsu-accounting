'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatBaht, toSatang } from '@/lib/money'
import { formatThaiMonth, getMonthKey, getTodayBKK } from '@/lib/utils'
import { compressImageFile } from '@/lib/compressImage'
import type { PaymentSlipGroup } from '@/lib/paymentSlipGrouping'
import type { BankAccount } from '@/types'

function thaiDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function PaymentSlipsPage() {
  const [month, setMonth] = useState(getMonthKey())
  const [groups, setGroups] = useState<PaymentSlipGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [openSerial, setOpenSerial] = useState<string | null>(null)
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [payingSerial, setPayingSerial] = useState<string | null>(null)
  const [savingPayment, setSavingPayment] = useState(false)
  const [uploadingSlip, setUploadingSlip] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentForm, setPaymentForm] = useState({
    payment_date: getTodayBKK(), bank_account_id: '', amount: '', slip_image_url: '', note: '',
  })

  function loadGroups() {
    return fetch(`/api/flowaccount/payment-slips?month=${month}`)
      .then(response => response.json())
      .then(json => setGroups(json.data || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadGroups()
    // loadGroups is intentionally scoped to this client page; month is the only
    // value that should trigger re-fetching the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  useEffect(() => {
    fetch('/api/bank-accounts').then(response => response.json()).then(data => setBanks(Array.isArray(data) ? data : []))
  }, [])

  function openPaymentForm(group: PaymentSlipGroup) {
    const payment = group.local_payment
    setPaymentError('')
    setPaymentForm({
      payment_date: payment?.payment_date || getTodayBKK(),
      bank_account_id: payment?.bank_account_id || '',
      amount: ((payment?.amount_satang ?? group.total_satang) / 100).toFixed(2),
      slip_image_url: payment?.slip_image_url || '',
      note: payment?.note || '',
    })
    setPayingSerial(group.serial)
  }

  async function uploadSlip(file: File) {
    setUploadingSlip(true)
    setPaymentError('')
    try {
      const compressed = await compressImageFile(file)
      const formData = new FormData()
      formData.append('file', compressed)
      const response = await fetch('/api/upload/receipt', { method: 'POST', body: formData })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'อัปโหลดสลิปไม่สำเร็จ')
      setPaymentForm(form => ({ ...form, slip_image_url: json.url }))
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'อัปโหลดสลิปไม่สำเร็จ')
    } finally {
      setUploadingSlip(false)
    }
  }

  async function savePayment(event: React.FormEvent) {
    event.preventDefault()
    if (!payingSerial) return
    if (!paymentForm.slip_image_url) {
      setPaymentError('กรุณาแนบสลิปการโอน')
      return
    }
    setSavingPayment(true)
    setPaymentError('')
    try {
      const response = await fetch(`/api/flowaccount/payment-slips/${payingSerial}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: paymentForm.payment_date,
          bank_account_id: paymentForm.bank_account_id,
          amount_satang: toSatang(Number(paymentForm.amount)),
          slip_image_url: paymentForm.slip_image_url,
          note: paymentForm.note,
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'บันทึกการชำระไม่สำเร็จ')
      setPayingSerial(null)
      await loadGroups()
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'บันทึกการชำระไม่สำเร็จ')
    } finally {
      setSavingPayment(false)
    }
  }

  const total = groups.reduce((sum, group) => sum + group.total_satang, 0)
  return (
    <div className="space-y-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/expenses" className="text-xs text-blue-600">← กลับไปรายจ่าย</Link>
          <h1 className="text-lg font-bold mt-1" style={{ color: 'var(--charcoal)' }}>ใบเตรียมจ่าย</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {groups.length} ใบ · {formatBaht(total)}
          </p>
        </div>
        <select value={month} onChange={event => { setLoading(true); setMonth(event.target.value) }}
          className="text-sm border rounded-lg px-2 py-1.5 bg-white" style={{ borderColor: 'var(--border)' }}>
          {Array.from({ length: 12 }, (_, index) => {
            const date = new Date()
            date.setMonth(date.getMonth() - index)
            const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
            return <option key={key} value={key}>{formatThaiMonth(key)}</option>
          })}
        </select>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>}
      {!loading && groups.map(group => {
        const open = openSerial === group.serial
        return (
          <div key={group.serial} className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <button className="w-full p-4 text-left" onClick={() => setOpenSerial(open ? null : group.serial)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-blue-700">{group.serial}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {group.status === 'paid' ? 'ชำระ' : 'ครบกำหนด'} {thaiDate(group.payment_date)} · {group.expenses.length} เอกสาร
                  </p>
                  {group.payment_channel && <p className="text-xs mt-1 text-gray-500">{group.payment_channel}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold" style={{ color: 'var(--charcoal)' }}>{formatBaht(group.total_satang)}</p>
                  <span className={`text-xs ${group.status === 'paid' ? 'text-green-700' : group.status === 'awaiting_flowaccount' ? 'text-blue-700' : 'text-amber-700'}`}>
                    {group.status === 'paid' ? 'ชำระเงินแล้ว' : group.status === 'awaiting_flowaccount' ? 'ชำระแล้ว — รอบันทึก FlowAccount' : 'รอชำระ'}
                  </span>
                  {group.gross_total_satang !== group.total_satang && (
                    <p className="text-[10px] text-gray-400">ก่อนหัก WHT {formatBaht(group.gross_total_satang)}</p>
                  )}
                </div>
              </div>
            </button>
            {open && (
              <div className="border-t px-4 py-2" style={{ borderColor: 'var(--border)' }}>
                {group.local_payment && (
                  <div className="my-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">ข้อมูลการโอนจาก KINTSU</p>
                        <p className="mt-1">{thaiDate(group.local_payment.payment_date)} · {group.local_payment.bank_name} {group.local_payment.account_number}</p>
                        <p>{formatBaht(group.local_payment.amount_satang)}{group.local_payment.recorded_by_name ? ` · ${group.local_payment.recorded_by_name}` : ''}</p>
                      </div>
                      <a href={group.local_payment.slip_image_url} target="_blank" rel="noreferrer"
                        className="shrink-0 rounded-lg bg-white px-2 py-1 font-medium text-blue-700 border border-blue-200">
                        ดูสลิป
                      </a>
                    </div>
                    {group.local_payment.amount_satang !== group.total_satang && (
                      <p className="mt-2 font-medium text-red-700">ยอดโอนไม่ตรงกับยอด PAY {formatBaht(group.total_satang)}</p>
                    )}
                  </div>
                )}
                {group.expenses.map(expense => (
                  <div key={expense.id} className="py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{expense.flowaccount_document_serial}</p>
                        <p className="truncate text-xs text-gray-500">{expense.recipient_name || 'ไม่ระบุผู้ขาย'}</p>
                        <p className="text-xs text-gray-400">เอกสาร {thaiDate(expense.document_date)}{expense.flowaccount_reference ? ` · ${expense.flowaccount_reference}` : ''}</p>
                      </div>
                      <span className="shrink-0">{formatBaht(expense.total_satang)}</span>
                    </div>
                  </div>
                ))}
                {group.status !== 'paid' && payingSerial !== group.serial && (
                  <button type="button" onClick={() => openPaymentForm(group)}
                    className="my-2 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white">
                    {group.local_payment ? 'แก้ไขข้อมูลการชำระ' : 'ชำระและแนบสลิป'}
                  </button>
                )}
                {payingSerial === group.serial && (
                  <form onSubmit={savePayment} className="my-2 space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm font-semibold">บันทึกการชำระ {group.serial}</p>
                    <label className="block text-xs text-gray-600">วันที่ชำระ
                      <input type="date" required value={paymentForm.payment_date}
                        onChange={event => setPaymentForm(form => ({ ...form, payment_date: event.target.value }))}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-xs text-gray-600">บัญชีธนาคารที่ชำระ
                      <select required value={paymentForm.bank_account_id}
                        onChange={event => setPaymentForm(form => ({ ...form, bank_account_id: event.target.value }))}
                        className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
                        <option value="">เลือกบัญชี</option>
                        {banks.map(bank => <option key={bank.id} value={bank.id}>{bank.bank_name} · {bank.account_number}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs text-gray-600">ยอดโอนจริง
                      <input type="number" required min="0.01" step="0.01" value={paymentForm.amount}
                        onChange={event => setPaymentForm(form => ({ ...form, amount: event.target.value }))}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                    </label>
                    <div className="text-xs text-gray-600">สลิปการโอน
                      <input id={`payment-slip-${group.serial}`} type="file" accept="image/*" className="sr-only"
                        onChange={event => { const file = event.target.files?.[0]; if (file) uploadSlip(file) }}
                        disabled={uploadingSlip} />
                      <label htmlFor={`payment-slip-${group.serial}`}
                        className={`mt-1 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 text-center text-base font-medium transition-colors ${paymentForm.slip_image_url ? 'border-green-400 bg-green-50 text-green-700' : 'border-[#d8ccb7] bg-white text-[#766a58]'} ${uploadingSlip ? 'pointer-events-none opacity-60' : ''}`}>
                        {paymentForm.slip_image_url && !uploadingSlip && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={paymentForm.slip_image_url} alt="สลิปการโอน" className="max-h-48 rounded-lg object-contain" />
                        )}
                        {uploadingSlip
                          ? '⏳ กำลังอัปโหลดสลิป...'
                          : paymentForm.slip_image_url
                            ? '✅ แนบสลิปแล้ว · กดเพื่อเปลี่ยน'
                            : '📎 กดเพื่อแนบสลิป'}
                      </label>
                    </div>
                    <label className="block text-xs text-gray-600">หมายเหตุ (ถ้ามี)
                      <input type="text" value={paymentForm.note}
                        onChange={event => setPaymentForm(form => ({ ...form, note: event.target.value }))}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                    </label>
                    {paymentError && <p className="text-xs text-red-600">{paymentError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPayingSerial(null)} className="flex-1 rounded-lg border py-2 text-sm">ยกเลิก</button>
                      <button type="submit" disabled={savingPayment || uploadingSlip}
                        className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {uploadingSlip ? 'กำลังอัปโหลด...' : savingPayment ? 'กำลังบันทึก...' : 'ยืนยันการชำระ'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )
      })}
      {!loading && groups.length === 0 && <div className="text-center py-12 text-gray-400">ไม่มีใบเตรียมจ่ายในเดือนนี้</div>}
    </div>
  )
}
