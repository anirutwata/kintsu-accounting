// FlowAccount OpenAPI client — auto tax-invoice issuance + expense sync.
// Currently pointed at Sandbox via FLOWACCOUNT_API_BASE; switch envs to go Production.
// Docs: https://developers.flowaccount.com/api-reference

const TOKEN_URL = process.env.FLOWACCOUNT_TOKEN_URL!
const API_BASE = process.env.FLOWACCOUNT_API_BASE!
const CLIENT_ID = process.env.FLOWACCOUNT_CLIENT_ID!
const CLIENT_SECRET = process.env.FLOWACCOUNT_CLIENT_SECRET!
const SCOPE = process.env.FLOWACCOUNT_SCOPE!

let cachedToken: { accessToken: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: SCOPE,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(`FlowAccount token request failed: ${json.error ?? res.statusText}`)
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  return cachedToken.accessToken
}

async function flowAccountFetch(path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  })
  const json = await res.json()
  if (!res.ok || json.status === false) {
    throw new Error(`FlowAccount API error (${res.status}): ${JSON.stringify(json.data ?? json.message)}`)
  }
  return json.data
}

export interface ExpenseCategory {
  // Only populated for the curated "business category" subset — most of the accounting
  // chart of accounts has no systemCode/categoryId and posts via creditId/debitId alone.
  systemCode: number | null
  categoryId: number | null
  nameLocal: string
  nameForeign: string
  debitCode?: string
  creditId: number
  creditCategory: number
  debitId: number
  debitCategory: number
}

// Uses the accounting-view endpoint (full chart of accounts, ~138 entries) instead of
// /expenses/categories/business (~40 curated entries) — confirmed with FlowAccount support
// (2026-08-20) and verified live against Production that account_code/creditId/debitId
// posting works for entries outside the curated business list.
export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const data = await flowAccountFetch('/expenses/categories/accounting')
  return (data ?? []).map((c: any) => ({
    systemCode: c.systemCode ? Number(c.systemCode) : null,
    categoryId: c.categoryId ? Number(c.categoryId) : null,
    nameLocal: c.nameLocal || c.debitNameLocal,
    nameForeign: c.nameForeign || c.debitNameForeign,
    debitCode: c.debitCode,
    creditId: Number(c.creditId),
    creditCategory: Number(c.creditCategory),
    debitId: Number(c.debitId),
    debitCategory: Number(c.debitCategory),
  }))
}

export interface CreateExpenseInput {
  contactName: string
  publishedOn: string // YYYY-MM-DD
  remarks?: string
  items: {
    description: string
    category: ExpenseCategory // from getExpenseCategories()
    quantity: number
    unitName: string
    pricePerUnit: number
  }[]
}

export async function createExpense(input: CreateExpenseInput) {
  const items = input.items.map((item) => {
    const total = round2(item.quantity * item.pricePerUnit)
    return {
      // systemCode/categoryId only exist for the curated business-category subset —
      // omitted (not sent as 0) for a plain chart-of-account category, since creditId/
      // debitId alone are what the document actually posts against.
      ...(item.category.systemCode != null ? { systemCode: item.category.systemCode } : {}),
      ...(item.category.categoryId != null ? { categoryId: item.category.categoryId } : {}),
      description: item.description,
      creditId: item.category.creditId,
      creditCategory: item.category.creditCategory,
      debitId: item.category.debitId,
      debitCategory: item.category.debitCategory,
      quantity: item.quantity,
      unitName: item.unitName,
      pricePerUnit: item.pricePerUnit,
      total,
    }
  })
  const subTotal = round2(items.reduce((sum, i) => sum + i.total, 0))

  return flowAccountFetch('/expenses', {
    method: 'POST',
    body: JSON.stringify({
      recordId: 0,
      expenseStructureType: 'ExpenseSimpleDocument',
      contactName: input.contactName,
      publishedOn: input.publishedOn,
      isVatInclusive: false,
      isVat: false,
      subTotal,
      discountAmount: 0,
      totalAfterDiscount: subTotal,
      vatAmount: 0,
      grandTotal: subTotal,
      remarks: input.remarks ?? '',
      items,
    }),
  })
}

// Downloads an image from a public URL (e.g. Supabase storage) and attaches it to an
// already-created expense document. Best-effort — throws on failure so callers can
// decide whether a failed attachment should block the rest of the flow.
export async function attachExpenseFiles(recordId: number, imageUrls: string[]) {
  const files = await Promise.all(
    imageUrls.map(async (url, i) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`โหลดรูป ${url} ไม่สำเร็จ (${res.status})`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.includes('png') ? 'png' : contentType.includes('pdf') ? 'pdf' : 'jpg'
      return { fileName: `attachment-${i + 1}.${ext}`, base64Data: buffer.toString('base64') }
    }),
  )
  return flowAccountFetch(`/expenses/${recordId}/attachment/base64`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

interface SellItemInput {
  name: string
  quantity: number
  unitName: string
  pricePerUnit: number
}

function buildSellDocument(input: {
  contactName: string
  contactTaxId?: string
  contactAddress?: string
  contactBranch?: string
  contactGroup?: 'individual' | 'juristic'
  publishedOn: string
  remarks?: string
  items: SellItemInput[]
}) {
  const items = input.items.map((item) => ({
    name: item.name,
    type: 3, // non-inventory
    quantity: item.quantity,
    unitName: item.unitName,
    pricePerUnit: item.pricePerUnit,
    total: round2(item.quantity * item.pricePerUnit),
  }))
  const subTotal = round2(items.reduce((sum, i) => sum + i.total, 0))
  const vatAmount = round2(subTotal * 0.07)
  const grandTotal = round2(subTotal + vatAmount)

  return {
    recordId: 0,
    documentStructureType: 'SimpleDocument',
    contactName: input.contactName,
    contactTaxId: input.contactTaxId,
    contactAddress: input.contactAddress,
    contactBranch: input.contactBranch,
    contactGroup: input.contactGroup,
    publishedOn: input.publishedOn,
    isVatInclusive: false,
    isVat: true,
    subTotal,
    discountAmount: 0,
    totalAfterDiscount: subTotal,
    vatAmount,
    grandTotal,
    remarks: input.remarks ?? '',
    items,
  }
}

export interface TaxInvoicePayment {
  paymentDate: string // YYYY-MM-DD
  method: 'cash' | 'transfer' | 'otherChannel'
  // Required when method === 'transfer' — pre-configured in FlowAccount
  // MyCompany > Bank Channel > Bank Accounts (GET /bank-channel/bank-accounts).
  bankAccountId?: number
  // Required when method === 'otherChannel' — pre-configured in FlowAccount
  // MyCompany > Bank Channel > Other Channels (GET /bank-channel/other-channels).
  otherChannelId?: number
  otherChannelType?: number // 1=POS, 3=Payment Gateway, 5=EDC, 7=Online shop
  otherChannelName?: string
  // ปัดเศษ (บาท) — ยอดชำระจริง = grandTotal - roundingAmount. Positive = ปัดเศษลง.
  roundingAmount?: number
}

// Resolves a payment method + rounding into a TaxInvoicePayment using the bank/EDC
// channel ids configured in env (must be pre-configured in FlowAccount's own
// MyCompany > Bank Channel settings first). Throws a user-facing error if the
// chosen channel isn't configured yet.
export function resolveTaxInvoicePayment(
  method: 'cash' | 'transfer' | 'credit_card',
  paymentDate: string,
  roundingAmount: number,
): TaxInvoicePayment {
  if (method === 'cash') return { paymentDate, method: 'cash', roundingAmount }
  if (method === 'transfer') {
    const bankAccountId = Number(process.env.FLOWACCOUNT_BANK_ACCOUNT_ID)
    if (!bankAccountId) throw new Error('ยังไม่ได้ตั้งค่าบัญชีธนาคารสำหรับรับโอนเงินใน FlowAccount (FLOWACCOUNT_BANK_ACCOUNT_ID)')
    return { paymentDate, method: 'transfer', bankAccountId, roundingAmount }
  }
  const otherChannelId = Number(process.env.FLOWACCOUNT_EDC_CHANNEL_ID)
  if (!otherChannelId) throw new Error('ยังไม่ได้ตั้งค่าเครื่องรูดบัตร EDC ใน FlowAccount (FLOWACCOUNT_EDC_CHANNEL_ID)')
  return {
    paymentDate,
    method: 'otherChannel',
    otherChannelId,
    otherChannelType: 5, // EDC
    otherChannelName: process.env.FLOWACCOUNT_EDC_CHANNEL_NAME || 'เครื่องรูดบัตรเครดิต',
    roundingAmount,
  }
}

export interface CreateTaxInvoiceInput {
  contactName: string
  contactTaxId?: string
  contactAddress?: string
  contactBranch?: string
  contactGroup?: 'individual' | 'juristic'
  publishedOn: string // YYYY-MM-DD
  remarks?: string
  items: SellItemInput[]
  payment?: TaxInvoicePayment
}

// Shared payment-block shape used by both tax-invoices/with-payment and
// cash-invoices/with-payment — same underlying document engine.
function buildPaymentFields(payment: TaxInvoicePayment) {
  if (payment.method === 'cash') {
    return { documentPaymentStructureType: 'SimpleDocumentWithPaymentReceivingCash', paymentMethod: 1 }
  }
  if (payment.method === 'transfer') {
    return {
      documentPaymentStructureType: 'SimpleDocumentWithPaymentReceivingTransfer',
      paymentMethod: 5,
      bankAccountId: payment.bankAccountId,
    }
  }
  return {
    documentPaymentStructureType: 'SimpleDocumentWithPaymentReceivingOtherChannel',
    paymentMethod: 13,
    otherChannelId: payment.otherChannelId,
    otherChannelPaymentChannel: payment.otherChannelType,
    otherChannelName: payment.otherChannelName,
  }
}

export async function createTaxInvoice(input: CreateTaxInvoiceInput) {
  const document = buildSellDocument(input)
  if (!input.payment) {
    return flowAccountFetch('/tax-invoices', { method: 'POST', body: JSON.stringify(document) })
  }

  const { payment } = input
  const rounding = payment.roundingAmount ?? 0
  const collected = round2(document.grandTotal - rounding)
  const paymentFields = buildPaymentFields(payment)

  return flowAccountFetch('/tax-invoices/with-payment', {
    method: 'POST',
    body: JSON.stringify({
      ...document,
      ...paymentFields,
      // documentDeductionType/Amount + useReceiptDeduction is what actually renders the
      // "ปัดเศษลง"/"ยอดชำระ" lines on the PDF — this is the checkbox next to the
      // ปัดเศษลง/ขึ้น dropdown in the FlowAccount web UI. paymentDeductionType/Amount
      // (payment-level) is silently accepted but never displayed — verified by testing both.
      useReceiptDeduction: rounding > 0,
      documentDeductionType: rounding > 0 ? 7 : 0, // 7 = ปัดเศษ
      documentDeductionAmount: rounding,
      paymentDate: payment.paymentDate,
      collected,
    }),
  })
}

// Returns base64-encoded PDF bytes (ใบกำกับภาษี + ใบเสร็จรับเงิน รวมในไฟล์เดียว)
export async function exportTaxInvoicePdfBase64(recordId: number): Promise<string> {
  return flowAccountFetch(`/tax-invoices/${recordId}/export-pdf/base64`, {
    method: 'POST',
    body: JSON.stringify({
      culture: 'th',
      document: { original: true },
      receipt: { original: true },
    }),
  })
}

export interface CreateCashInvoiceInput {
  contactName: string
  publishedOn: string // YYYY-MM-DD
  remarks?: string
  items: SellItemInput[]
  payment?: TaxInvoicePayment
}

// Cash invoice = ใบกำกับภาษี/ใบเสร็จรับเงินรวมกัน สำหรับยอดขายที่รับเงินทันที (ไม่ต้องมีเลขผู้เสียภาษีลูกค้า)
// Passing `payment` marks it paid via that channel on create (cash-invoices/with-payment) —
// omitting it silently defaults to "cash" on FlowAccount's side, which is why the daily-sales
// sync always sets this now instead of leaving it unset.
export async function createCashInvoice(input: CreateCashInvoiceInput) {
  const document = buildSellDocument(input)
  if (!input.payment) {
    return flowAccountFetch('/cash-invoices', { method: 'POST', body: JSON.stringify(document) })
  }

  const { payment } = input
  const collected = round2(document.grandTotal - (payment.roundingAmount ?? 0))
  const paymentFields = buildPaymentFields(payment)

  return flowAccountFetch('/cash-invoices/with-payment', {
    method: 'POST',
    body: JSON.stringify({
      ...document,
      ...paymentFields,
      paymentDate: payment.paymentDate,
      collected,
    }),
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
