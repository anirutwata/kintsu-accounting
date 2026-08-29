'use client'
import { useEffect, useState } from 'react'
import { formatBaht } from '@/lib/money'
import { formatThaiMonth, getMonthKey } from '@/lib/utils'
import type { TaxInvoiceRequest } from '@/types'

function thaiDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'เงินสด', transfer: 'โอนเงิน', credit_card: 'บัตรเครดิต (EDC)' }
const GROUP_LABELS: Record<string, string> = { individual: 'บุคคลธรรมดา', juristic: 'นิติบุคคล' }

function statusInfo(request: TaxInvoiceRequest): { label: string; color: string; detail?: string } {
  if (request.status === 'rejected') return { label: 'ปฏิเสธ', color: 'text-gray-500' }
  if (request.status === 'cancelled') {
    return { label: 'ยกเลิก (ใบกำกับภาษีถูกยกเลิกใน FlowAccount)', color: 'text-gray-500', detail: request.error_message || undefined }
  }
  if (request.dedup_state === 'manual_review' || request.status === 'accounting_review') {
    return { label: 'รอผู้ทำบัญชีตรวจสอบ', color: 'text-amber-700', detail: request.dedup_error || request.error_message || undefined }
  }
  if (request.dedup_action === 'pending_edc_report') {
    return { label: 'ออกใบแล้ว รอปรับยอด EDC', color: 'text-blue-700', detail: request.flowaccount_document_serial || undefined }
  }
  if (request.dedup_action === 'pending_cash_sales') {
    return { label: 'ออกใบแล้ว รอปรับยอดเงินสด', color: 'text-blue-700', detail: request.flowaccount_document_serial || undefined }
  }
  if (request.dedup_action === 'pending_ttb_report') {
    return { label: 'ออกใบแล้ว รอรายงาน TTB', color: 'text-blue-700', detail: request.flowaccount_document_serial || undefined }
  }
  if (request.dedup_state === 'complete' || request.status === 'emailed') {
    return { label: 'สำเร็จ', color: 'text-green-700', detail: request.flowaccount_document_serial || undefined }
  }
  if (request.status === 'pending_review' && request.error_message) {
    return { label: 'ล้มเหลว รอลองใหม่', color: 'text-red-700', detail: request.error_message }
  }
  if (request.status === 'pending_review') return { label: 'รอตรวจสอบ', color: 'text-amber-700' }
  if (request.status === 'processing') return { label: 'กำลังดำเนินการ', color: 'text-blue-700' }
  return { label: request.status, color: 'text-gray-500' }
}

export default function TaxInvoiceRequestsPage() {
  const [month, setMonth] = useState(getMonthKey())
  const [requests, setRequests] = useState<TaxInvoiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/tax-invoice-requests?month=${month}`)
      .then(response => response.json())
      .then(data => setRequests(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [month])

  const query = search.trim().toLowerCase()
  const filtered = requests.filter(request =>
    !query || request.contact_name.toLowerCase().includes(query) || (request.contact_tax_id || '').includes(query),
  )
  const total = filtered.reduce((sum, request) => sum + request.total_satang, 0)

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>คำขอใบกำกับภาษี</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {filtered.length} คำขอ · {formatBaht(total)}
          </p>
        </div>
        <select value={month} onChange={event => setMonth(event.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5 bg-white" style={{ borderColor: 'var(--border)' }}>
          {Array.from({ length: 12 }, (_, index) => {
            const date = new Date()
            date.setMonth(date.getMonth() - index)
            const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
            return <option key={key} value={key}>{formatThaiMonth(key)}</option>
          })}
        </select>
      </div>

      <input type="search" placeholder="ค้นหาชื่อลูกค้า/เลขผู้เสียภาษี" value={search}
        onChange={event => setSearch(event.target.value)}
        className="w-full text-sm border rounded-lg px-3 py-2" style={{ borderColor: 'var(--border)' }} />

      {loading && <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>}
      {!loading && filtered.map(request => {
        const open = openId === request.id
        const info = statusInfo(request)
        return (
          <div key={request.id} className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <button className="w-full p-4 text-left" onClick={() => setOpenId(open ? null : request.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{request.contact_name}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {thaiDate(request.document_date)} · {PAYMENT_LABELS[request.payment_method || ''] || request.payment_method}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold" style={{ color: 'var(--charcoal)' }}>{formatBaht(request.total_satang)}</p>
                  <span className={`text-xs ${info.color}`}>{info.label}</span>
                </div>
              </div>
            </button>
            {open && (
              <div className="border-t px-4 py-3 text-sm space-y-1" style={{ borderColor: 'var(--border)' }}>
                {request.contact_group && <p>ประเภท: {GROUP_LABELS[request.contact_group]}</p>}
                {request.contact_tax_id && <p>เลขผู้เสียภาษี: {request.contact_tax_id}</p>}
                {request.contact_branch && <p>สาขา: {request.contact_branch}</p>}
                <p>อีเมล: {request.contact_email}</p>
                {request.contact_address && <p>ที่อยู่: {request.contact_address}</p>}
                <p>รายการ: {request.description}</p>
                <p>ก่อน VAT: {formatBaht(request.subtotal_satang)}</p>
                {request.reviewed_by && (
                  <p>อนุมัติโดย: {request.reviewed_by}{request.reviewed_at ? ` · ${thaiDate(request.reviewed_at.slice(0, 10))}` : ''}</p>
                )}
                {request.flowaccount_document_serial && <p>เลขที่เอกสาร: {request.flowaccount_document_serial}</p>}
                {info.detail && <p className={info.color}>{info.detail}</p>}
                {request.bill_image_url && (
                  <a href={request.bill_image_url} target="_blank" rel="noreferrer"
                    className="inline-block mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium text-blue-700"
                    style={{ borderColor: 'var(--border)' }}>
                    ดูรูปบิล
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
      {!loading && filtered.length === 0 && <div className="text-center py-12 text-gray-400">ไม่มีคำขอในเดือนนี้</div>}
    </div>
  )
}
