'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatBaht } from '@/lib/money'
import { formatThaiMonth, getMonthKey } from '@/lib/utils'
import type { PaymentSlipGroup } from '@/lib/paymentSlipGrouping'

function thaiDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function PaymentSlipsPage() {
  const [month, setMonth] = useState(getMonthKey())
  const [groups, setGroups] = useState<PaymentSlipGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [openSerial, setOpenSerial] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/flowaccount/payment-slips?month=${month}`)
      .then(response => response.json())
      .then(json => setGroups(json.data || []))
      .finally(() => setLoading(false))
  }, [month])

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
                    ชำระ {thaiDate(group.payment_date)} · {group.expenses.length} เอกสาร
                  </p>
                  {group.payment_channel && <p className="text-xs mt-1 text-gray-500">{group.payment_channel}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold" style={{ color: 'var(--charcoal)' }}>{formatBaht(group.total_satang)}</p>
                  <span className="text-xs text-green-700">ชำระเงินแล้ว</span>
                </div>
              </div>
            </button>
            {open && (
              <div className="border-t px-4 py-2" style={{ borderColor: 'var(--border)' }}>
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
              </div>
            )}
          </div>
        )
      })}
      {!loading && groups.length === 0 && <div className="text-center py-12 text-gray-400">ไม่มีใบเตรียมจ่ายในเดือนนี้</div>}
    </div>
  )
}
