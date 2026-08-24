export interface FlowAccountExpenseItem {
  description?: string
  debitId?: number | string
  debitCode?: string
  debitNameLocal?: string
  quantity?: number | string
  unitName?: string
  pricePerUnit?: number | string
  total?: number | string
}

export interface FlowAccountExpenseDocument {
  recordId: number
  documentSerial: string
  status: number | string
  statusString?: string
  publishedOn: string
  dueDate?: string
  contactName?: string
  contactAddress?: string
  reference?: string
  subTotal?: number | string
  discountAmount?: number | string
  vatAmount?: number | string
  grandTotal?: number | string
  isVatInclusive?: boolean
  documentWithholdingTaxAmount?: number | string
  isDelete?: boolean
  referencedToMe?: Array<{
    documentType?: number | string
    documentSerial?: string
  }>
  payments?: {
    paymentDate?: string
    paymentMethod?: number | string
    paymentChannel?: string
    pettyCashName?: string
  }
  items?: FlowAccountExpenseItem[]
}

export interface ImportedExpenseRow {
  document_date: string
  date: string
  category: string
  amount_satang: number
  vat_satang: number
  vat_inclusive: boolean
  wht_satang: number
  discount_satang: number
  total_satang: number
  payment_method: 'เงินสด' | 'โอนเงิน' | 'บัตรเครดิต' | 'เครดิต'
  is_paid: boolean
  is_deleted: boolean
  deleted_at: null
  recipient_name: string | null
  recipient_address: string | null
  note: string | null
  created_by_name: string
  flowaccount_record_id: number
  flowaccount_document_serial: string
  flowaccount_payment_slip_serial: string
  flowaccount_payment_status: string
  flowaccount_payment_channel: string | null
  flowaccount_reference: string | null
  flowaccount_synced_at: string
  source: 'flowaccount_payment_slip'
}

export interface ImportedExpenseItemRow {
  category: string
  description: string
  quantity: number
  unit: string
  price_per_unit_satang: number
  total_satang: number
  sort_order: number
}

function toSatang(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

function isoDate(value: string | undefined, fallback: string): string {
  return (value || fallback).slice(0, 10)
}

function paymentSlipSerial(document: FlowAccountExpenseDocument): string | null {
  return document.referencedToMe?.find(reference =>
    String(reference.documentType) === '37' || reference.documentSerial?.startsWith('PAY'),
  )?.documentSerial ?? null
}

function paymentMethod(value: number | string | undefined, paid: boolean): ImportedExpenseRow['payment_method'] {
  if (!paid) return 'เครดิต'
  if (String(value) === '1') return 'เงินสด'
  if (String(value) === '5') return 'โอนเงิน'
  if (String(value) === '11') return 'เงินสด'
  if (String(value) === '13') return 'บัตรเครดิต'
  throw new Error(`ไม่รองรับ paymentMethod=${String(value)}`)
}

export function isPaidByPaymentSlip(document: FlowAccountExpenseDocument): boolean {
  return !document.isDelete &&
    (['4', '6'].includes(String(document.status)) || ['pendingPayment', 'paidByPaymentSlip'].includes(document.statusString || '')) &&
    paymentSlipSerial(document) !== null
}

export function selectImportCandidates(
  documents: FlowAccountExpenseDocument[],
  existingRecordIds: Set<number>,
): FlowAccountExpenseDocument[] {
  return documents.filter(document => isPaidByPaymentSlip(document) && !existingRecordIds.has(document.recordId))
}

export function mapFlowAccountExpense(
  document: FlowAccountExpenseDocument,
  categoryByDebitId: Map<number, string>,
): { expense: ImportedExpenseRow; items: ImportedExpenseItemRow[] } {
  const paySerial = paymentSlipSerial(document)
  if (!paySerial) throw new Error(`${document.documentSerial} ไม่มีเลขใบเตรียมจ่าย PAY`)

  const fallbackCategory = 'ค่าบริการอื่นๆ'
  const items = (document.items ?? []).map((item, sortOrder) => {
    const quantity = Number(item.quantity ?? 1) || 1
    const totalSatang = toSatang(item.total ?? Number(item.pricePerUnit ?? 0) * quantity)
    const debitId = Number(item.debitId)
    return {
      category: categoryByDebitId.get(debitId) ?? fallbackCategory,
      description: item.description || item.debitNameLocal || document.reference || document.documentSerial,
      // FlowAccount can carry inline item discounts. KINTSU stores the authoritative
      // post-discount line total, so use one summarized unit instead of re-deriving a
      // subtly different amount from quantity × pre-discount unit price.
      quantity: 1,
      unit: item.unitName || 'รายการ',
      price_per_unit_satang: totalSatang,
      total_satang: totalSatang,
      sort_order: sortOrder,
    }
  })

  const discountSatang = toSatang(document.discountAmount)
  const vatSatang = toSatang(document.vatAmount)
  const totalSatang = toSatang(document.grandTotal)
  const amountSatang = Math.max(1, totalSatang - (document.isVatInclusive ? 0 : vatSatang) + discountSatang)
  const paid = String(document.status) === '6' || document.statusString === 'paidByPaymentSlip'
  const primaryCategory = items.length === 0
    ? fallbackCategory
    : [...new Set(items.map(item => item.category))].length === 1
      ? items[0].category
      : `หลายหมวดหมู่ (${new Set(items.map(item => item.category)).size})`

  return {
    expense: {
      document_date: isoDate(document.publishedOn, document.payments?.paymentDate || ''),
      date: isoDate(document.payments?.paymentDate, document.dueDate || document.publishedOn),
      category: primaryCategory,
      amount_satang: amountSatang,
      vat_satang: vatSatang,
      vat_inclusive: Boolean(document.isVatInclusive),
      wht_satang: toSatang(document.documentWithholdingTaxAmount),
      discount_satang: discountSatang,
      total_satang: totalSatang,
      payment_method: paymentMethod(document.payments?.paymentMethod, paid),
      is_paid: paid,
      is_deleted: false,
      deleted_at: null,
      recipient_name: document.contactName || null,
      recipient_address: document.contactAddress || null,
      note: document.reference ? `เลขที่อ้างอิง ${document.reference}` : null,
      created_by_name: 'FlowAccount Sync',
      flowaccount_record_id: document.recordId,
      flowaccount_document_serial: document.documentSerial,
      flowaccount_payment_slip_serial: paySerial,
      flowaccount_payment_status: document.statusString || 'paidByPaymentSlip',
      flowaccount_payment_channel: document.payments?.paymentChannel || document.payments?.pettyCashName || null,
      flowaccount_reference: document.reference || null,
      flowaccount_synced_at: new Date().toISOString(),
      source: 'flowaccount_payment_slip',
    },
    items,
  }
}
