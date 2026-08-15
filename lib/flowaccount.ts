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
  systemCode: number
  categoryId: number
  nameLocal: string
  nameForeign: string
  creditId: number
  creditCategory: number
  debitId: number
  debitCategory: number
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const data = await flowAccountFetch('/expenses/categories/business')
  return (data ?? []).map((c: any) => ({
    systemCode: Number(c.systemCode),
    categoryId: Number(c.categoryId),
    nameLocal: c.nameLocal,
    nameForeign: c.nameForeign,
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
      systemCode: item.category.systemCode,
      categoryId: item.category.categoryId,
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
  publishedOn: string // YYYY-MM-DD
  remarks?: string
  items: SellItemInput[]
  payment?: TaxInvoicePayment
}

export async function createTaxInvoice(input: CreateTaxInvoiceInput) {
  const document = buildSellDocument(input)
  if (!input.payment) {
    return flowAccountFetch('/tax-invoices', { method: 'POST', body: JSON.stringify(document) })
  }

  const { payment } = input
  const rounding = payment.roundingAmount ?? 0
  const collected = round2(document.grandTotal - rounding)
  const paymentFields =
    payment.method === 'cash'
      ? { documentPaymentStructureType: 'SimpleDocumentWithPaymentReceivingCash', paymentMethod: 1 }
      : payment.method === 'transfer'
        ? {
            documentPaymentStructureType: 'SimpleDocumentWithPaymentReceivingTransfer',
            paymentMethod: 5,
            bankAccountId: payment.bankAccountId,
          }
        : {
            documentPaymentStructureType: 'SimpleDocumentWithPaymentReceivingOtherChannel',
            paymentMethod: 13,
            otherChannelId: payment.otherChannelId,
            otherChannelPaymentChannel: payment.otherChannelType,
            otherChannelName: payment.otherChannelName,
          }

  return flowAccountFetch('/tax-invoices/with-payment', {
    method: 'POST',
    body: JSON.stringify({
      ...document,
      ...paymentFields,
      paymentDate: payment.paymentDate,
      collected,
      paymentDeductionType: rounding > 0 ? 7 : 0, // 7 = ปัดเศษ
      paymentDeductionAmount: rounding,
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
}

// Cash invoice = ใบกำกับภาษี/ใบเสร็จรับเงินรวมกัน สำหรับยอดขายที่รับเงินทันที (ไม่ต้องมีเลขผู้เสียภาษีลูกค้า)
export async function createCashInvoice(input: CreateCashInvoiceInput) {
  return flowAccountFetch('/cash-invoices', {
    method: 'POST',
    body: JSON.stringify(buildSellDocument(input)),
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
