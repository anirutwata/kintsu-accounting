// FlowAccount OpenAPI client — auto tax-invoice issuance + expense sync.
// Currently pointed at Sandbox via FLOWACCOUNT_API_BASE; switch envs to go Production.
// Docs: https://developers.flowaccount.com/api-reference

const TOKEN_URL = process.env.FLOWACCOUNT_TOKEN_URL!
const API_BASE = process.env.FLOWACCOUNT_API_BASE!
const CLIENT_ID = process.env.FLOWACCOUNT_CLIENT_ID!
const CLIENT_SECRET = process.env.FLOWACCOUNT_CLIENT_SECRET!
const SCOPE = process.env.FLOWACCOUNT_SCOPE!

let cachedToken: { accessToken: string; expiresAt: number } | null = null

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
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
  const attempt = async (forceRefresh: boolean) => {
    const accessToken = await getAccessToken(forceRefresh)
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    })
    const json = await res.json()
    return { res, json }
  }

  let { res, json } = await attempt(false)
  // A long-lived warm serverless instance can hold a cached token past its
  // real server-side lifetime (FlowAccount's actual validity has been
  // observed to run shorter than the expires_in it reports) — every request
  // then fails with the same opaque error until the instance restarts. One
  // forced-refresh retry recovers from that without waiting for a redeploy.
  if (!res.ok || json.status === false) {
    ;({ res, json } = await attempt(true))
  }
  if (!res.ok || json.status === false) {
    // json.data holds real validation detail (e.g. an array of field errors)
    // when present, but FlowAccount also returns json.data === false (a
    // literal boolean, not null/undefined) on some rejections — `??` doesn't
    // fall through to json.message for that, so it must be checked explicitly.
    const detail = json.data == null || json.data === false ? json.message : json.data
    throw new Error(`FlowAccount API error (${res.status}): ${JSON.stringify(detail)}`)
  }
  return json.data
}

export interface FlowAccountExpensePage {
  totalDocument: number
  list: unknown[]
}

export interface FlowAccountChartOfAccount {
  id: number
  code: string
  category: string
  nameLocal: string
  nameForeign: string
}

export async function getChartOfAccounts(): Promise<FlowAccountChartOfAccount[]> {
  const data = await flowAccountFetch('/chart-of-accounts/accounts')
  const accounts = (data?.accounts ?? []) as Array<{
    id: number | string
    code: number | string
    category: string
    nameLocal: string
    nameForeign: string
  }>
  return accounts.map(account => ({
    id: Number(account.id),
    code: String(account.code),
    category: account.category,
    nameLocal: account.nameLocal,
    nameForeign: account.nameForeign,
  }))
}

export async function createApprovedJournal(payload: import('./bankTransferJournal').FlowAccountJournalPayload) {
  return flowAccountFetch('/journal-entries/approve', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function voidJournalEntry(recordId: number) {
  return flowAccountFetch(`/journal-entries/${recordId}/void`, { method: 'POST' })
}

export async function getJournalEntry(recordId: number) {
  return flowAccountFetch(`/journal-entries/${recordId}`)
}

// FlowAccount has no PAY/payment-slip collection in its public OpenAPI. A paid
// payment slip is exposed through its source EXP documents instead: status=6,
// referencedToMe contains the PAY serial, and payments contains the batch's
// payment date/channel. Fetch the raw EXP rows so the import layer can group
// them by PAY without creating another expense for the PAY total.
export async function listFlowAccountExpenses(
  startDate: string,
  endDate: string,
  currentPage = 1,
  pageSize = 200,
): Promise<FlowAccountExpensePage> {
  const params = new URLSearchParams({
    currentPage: String(currentPage),
    pageSize: String(pageSize),
    range: '5',
    startDate,
    endDate,
  })
  const data = await flowAccountFetch(`/expenses?${params.toString()}`)
  return {
    totalDocument: Number(data?.totalDocument ?? 0),
    list: data?.list ?? [],
  }
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

// Full chart of accounts (~138 entries) — broader coverage than the curated business
// list (~40 entries) since some of this business's real categories don't have a
// matching business category at all. A subset of these entries happen to carry a
// systemCode/categoryId (when FlowAccount can match them to a business category
// itself); most don't — FlowAccount's schema marks both required on every line item,
// so a category mapped to a null-systemCode entry here fails sync (gated in
// expenseSync.ts). Prefer getBusinessCategories() below when it covers the category;
// fall back to this only for categories it doesn't.
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

// The curated "business category" list (~40 top-level entries, some with sub-
// categories) — every entry here always carries a non-null systemCode/categoryId,
// so anything mapped from this list is guaranteed to sync. Prefer this over
// getExpenseCategories() above whenever it has a matching entry.
export async function getBusinessCategories(): Promise<ExpenseCategory[]> {
  const data = (await flowAccountFetch('/expenses/categories/business')) ?? []
  const toEntry = (c: any, prefixLocal?: string, prefixForeign?: string): ExpenseCategory => ({
    systemCode: Number(c.systemCode),
    categoryId: Number(c.categoryId),
    nameLocal: prefixLocal ? `${prefixLocal} > ${c.nameLocal}` : c.nameLocal,
    nameForeign: prefixForeign ? `${prefixForeign} > ${c.nameForeign}` : c.nameForeign,
    debitCode: c.debitCode,
    creditId: Number(c.creditId),
    creditCategory: Number(c.creditCategory),
    debitId: Number(c.debitId),
    debitCategory: Number(c.debitCategory),
  })
  return data.flatMap((c: any) => [
    toEntry(c),
    ...(c.subCategories ?? []).map((sub: any) => toEntry(sub, c.nameLocal, c.nameForeign)),
  ])
}

export interface FlowAccountContact {
  id?: number // omitted when this came from OCR on a new vendor's bill, not an existing FlowAccount contact
  name: string
  address: string
  taxId: string
  branch: string
}

// Strips company-type prefixes/suffixes (บมจ., บริษัท...จำกัด (มหาชน), หจก., ฯลฯ) so
// "บมจ. ไทยน้ำทิพย์ คอร์ปอเรชั่น" and "บริษัท ไทยน้ำทิพย์ คอร์ปอเรชั่น จำกัด (มหาชน)" reduce
// to the same core — slip/OCR-derived names are rarely the exact registered legal name
// FlowAccount's contact master has on file. Keeps internal spacing (unlike the collapsed
// form used for equality checks below) so the result is still usable as a substring
// search term against FlowAccount's searchString param, which does a literal contains match.
function stripCompanyWords(name: string): string {
  return name
    .replace(/\(มหาชน\)/g, '')
    // บจก. before บจ. — "บจ" is a prefix of "บจก", so the shorter alternative must not
    // be tried first or it consumes "บจ" and strands a bare "ก." from "บจก." in the text.
    .replace(/บมจ\.?|บจก\.?|บจ\.?|หจก\.?/g, '')
    .replace(/บริษัท|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|จำกัด/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeContactName(name: string): string {
  return stripCompanyWords(name).replace(/\s+/g, '').toLowerCase()
}

// Looks up an existing FlowAccount contact by (fuzzy) name match, so expense sync can
// link to it via contactId instead of always creating a new blank ad-hoc contact — see
// notes/handoff.md 2026-08-21 for why this exists (duplicate-contact bug found via a
// live test sync). Returns null on no match — caller falls back to contactName-only.
export async function findContact(name: string): Promise<FlowAccountContact | null> {
  const target = normalizeContactName(name)
  if (!target) return null

  // Search with the company-word-stripped (but still spaced) core name — FlowAccount's
  // searchString does a literal substring match, so the raw name (e.g. still carrying a
  // "บมจ." prefix the real contact record doesn't have) can miss an exact-core match.
  const searchTerm = stripCompanyWords(name) || name
  const data = await flowAccountFetch(`/contacts?searchString=${encodeURIComponent(searchTerm)}&pageSize=20`)
  const candidates = (data?.list ?? []).filter((c: any) => normalizeContactName(c.contactName ?? '') === target)
  if (candidates.length === 0) return null

  // Prefer the candidate with the most complete address on file (a prior sync of this
  // same vendor may have already created a blank ad-hoc duplicate — don't reuse that one).
  const best = candidates.slice().sort((a: any, b: any) => (b.contactAddress?.length ?? 0) - (a.contactAddress?.length ?? 0))[0]
  return {
    id: Number(best.id),
    name: best.contactName,
    address: best.contactAddress ?? '',
    taxId: best.contactTaxId ?? '',
    branch: best.contactBranch ?? '',
  }
}

export interface CreateExpenseInput {
  contactName: string
  contact?: FlowAccountContact | null // from findContact() — links to the existing contact instead of creating a duplicate
  publishedOn: string // YYYY-MM-DD
  remarks?: string
  // VAT amount in baht, and whether it's already included in the item prices below.
  // vatInclusive true (retail-receipt style, shelf/line price already incl. VAT):
  // FlowAccount backs the 7% taxable base out of the total; grandTotal == subTotal.
  // vatInclusive false (formal tax-invoice style, e.g. ใบวางบิล/ใบแจ้งหนี้ — items
  // priced ex-VAT, VAT 7% a separate line): grandTotal = subTotal + vatAmount.
  vatAmount?: number
  vatInclusive?: boolean // ignored when vatAmount is unset; defaults true
  discountAmount?: number // baht, deducted from subTotal before VAT — matches FlowAccount's own discountAmount/totalAfterDiscount fields
  items: {
    description: string
    category: ExpenseCategory // from getExpenseCategories()
    quantity: number
    unitName: string
    pricePerUnit: number
  }[]
}

function buildExpensePayload(input: CreateExpenseInput) {
  const items = input.items.map((item) => {
    const total = round2(item.quantity * item.pricePerUnit)
    return {
      // FlowAccount's schema marks both required on every item — expenseSync.ts's gate
      // check blocks a sync before it reaches here if either is null, so this is never
      // actually omitted in practice; kept as optional spread only to match the
      // category's DB-nullable type without a redundant non-null assertion.
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
  const vatInclusive = input.vatInclusive ?? true
  const discountAmount = round2(input.discountAmount ?? 0)
  const totalAfterDiscount = round2(subTotal - discountAmount)
  const grandTotal = !input.vatAmount || vatInclusive ? totalAfterDiscount : round2(totalAfterDiscount + input.vatAmount)

  return {
    contactName: input.contact?.name ?? input.contactName,
    ...(input.contact
      ? {
          ...(input.contact.id != null ? { contactId: input.contact.id } : {}),
          contactAddress: input.contact.address,
          contactTaxId: input.contact.taxId,
          contactBranch: input.contact.branch,
        }
      : {}),
    publishedOn: input.publishedOn,
    isVatInclusive: vatInclusive,
    isVat: !!input.vatAmount,
    subTotal,
    discountAmount,
    totalAfterDiscount,
    vatAmount: input.vatAmount ?? 0,
    grandTotal,
    remarks: input.remarks ?? '',
    items,
  }
}

export interface FlowAccountBankAccount {
  id: number
  accountNumber: string
  accountName: string
  bankName: string
  branch: string
}

// This company's registered banking channels (MyCompany > Banking Channel > Bank
// Account in the FlowAccount web UI) — used to map a local bank_accounts row to
// the FlowAccount bankAccountId that payExpense()'s transfer method requires.
export async function getBankAccounts(): Promise<FlowAccountBankAccount[]> {
  const data = await flowAccountFetch('/bank-channel/bank-accounts')
  return (data ?? []).map((b: any) => ({
    id: Number(b.bankAccountId),
    accountNumber: b.bankAccountNumber,
    accountName: b.bankAccountName,
    bankName: b.bankName,
    branch: b.bankBranch,
  }))
}

export interface FlowAccountOtherChannel {
  id: number
  name: string
  type: number // 1=EDC, 3=POS, 5=Online Payment Gateway, 7=Online shop/E-commerce
}

// This company's "Other" payment channels (MyCompany > Banking Channel > Other Channel in
// the FlowAccount web UI) — covers EDC card machines, POS, and online payment gateways.
// Lets Settings offer a live dropdown instead of a raw FlowAccount channel ID typed by hand.
export async function getOtherPaymentChannels(): Promise<FlowAccountOtherChannel[]> {
  const data = await flowAccountFetch('/bank-channel/other-channels')
  return (data ?? []).map((c: any) => ({
    id: Number(c.otherChannelsId),
    name: c.otherChannelsName,
    type: Number(c.otherChannelsType),
  }))
}

export type ExpensePaymentChannel =
  | { method: 'cash' }
  | { method: 'transfer'; bankAccountId: number }
  | { method: 'other'; otherChannelId: number } // EDC card swipe, or any other configured "Other" channel

// Marks an already-created (awaiting) expense document as paid via the given
// channel — POST /expenses/{id}/payment. Verified live against the real Qsola
// company (test docs created + paid + voided during development, cash +
// transfer + other/EDC all confirmed): the payload is just {paymentMethod,
// paymentDate, collected, ...channel fields} — no "structure type" wrapper is
// required despite the spec's ExpenseSimpleDocumentWithPaymentPaid* schemas
// suggesting one (those are for the combined create+pay endpoint,
// /expenses/with-payment, which this app doesn't use — it always creates via
// plain /expenses first, matching the "must be awaiting" PUT/DELETE
// constraint the rest of this file already relies on).
export async function payExpense(recordId: number, paymentDate: string, collected: number, channel: ExpensePaymentChannel) {
  const channelFields =
    channel.method === 'cash' ? { paymentMethod: 1 }
    : channel.method === 'transfer' ? { paymentMethod: 5, bankAccountId: channel.bankAccountId }
    : { paymentMethod: 13, otherChannelId: channel.otherChannelId }
  return flowAccountFetch(`/expenses/${recordId}/payment`, {
    method: 'POST',
    body: JSON.stringify({ ...channelFields, paymentDate, collected: round2(collected) }),
  })
}

export async function createExpense(input: CreateExpenseInput) {
  return flowAccountFetch('/expenses', {
    method: 'POST',
    body: JSON.stringify({
      recordId: 0,
      expenseStructureType: 'ExpenseSimpleDocument',
      ...buildExpensePayload(input),
    }),
  })
}

// Only works while the document is still "รอดำเนินการ (Awaiting)" — true for every
// expense this app creates, since createExpense() never posts via /expenses/with-payment.
// companyName/companyAddress/companyBranch aren't part of CreateExpenseInput (create
// doesn't need them) but PUT requires them — fetched fresh from the existing document
// rather than hardcoded, so this stays correct if company details ever change.
export async function updateExpense(recordId: number, input: CreateExpenseInput) {
  const existing = await flowAccountFetch(`/expenses/${recordId}`)
  return flowAccountFetch(`/expenses/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify({
      recordId,
      expenseStructureType: 'UpdateExpenseSimpleDocument',
      companyName: existing.companyName,
      companyAddress: existing.companyAddress,
      companyBranch: existing.branch,
      ...buildExpensePayload(input),
    }),
  })
}

// Same "must be awaiting" constraint as updateExpense above.
export async function deleteExpenseDocument(recordId: number) {
  return flowAccountFetch(`/expenses/${recordId}`, { method: 'DELETE' })
}

// Downloads images from public URLs (e.g. Supabase storage) and returns them ready for
// a FlowAccount .../attachment/base64 call. Shared by every document type below.
async function buildAttachmentFiles(imageUrls: string[]) {
  return Promise.all(
    imageUrls.map(async (url, i) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`โหลดรูป ${url} ไม่สำเร็จ (${res.status})`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.includes('png') ? 'png' : contentType.includes('pdf') ? 'pdf' : 'jpg'
      return { fileName: `attachment-${i + 1}.${ext}`, base64Data: buffer.toString('base64') }
    }),
  )
}

// Attaches images to an already-created expense document. Best-effort — throws on
// failure so callers can decide whether a failed attachment should block the rest of
// the flow.
export async function attachExpenseFiles(recordId: number, imageUrls: string[]) {
  const files = await buildAttachmentFiles(imageUrls)
  return flowAccountFetch(`/expenses/${recordId}/attachment/base64`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

// Same as attachExpenseFiles, for a tax invoice — e.g. attaching the customer's own
// bill/receipt photo from the tax-invoice-request flow onto the issued document.
export async function attachTaxInvoiceFiles(recordId: number, imageUrls: string[]) {
  const files = await buildAttachmentFiles(imageUrls)
  return flowAccountFetch(`/tax-invoices/${recordId}/attachment/base64`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

interface SellItemInput {
  name: string
  quantity: number
  unitName: string
  pricePerUnit: number
  sellChartOfAccountCode?: string
}

// FlowAccount's contactGroup is an integer, not the string this app uses internally:
// 1 = บุคคลธรรมดา (individual), 3 = นิติบุคคล (juristic) — sending the raw string fails
// with "Could not convert string to integer".
const CONTACT_GROUP_CODE: Record<'individual' | 'juristic', number> = { individual: 1, juristic: 3 }

// Thai postal codes are 5 digits, conventionally written at the very end of the address —
// FlowAccount has a dedicated contactZipCode field on the contact record (separate from
// the free-text contactAddress that prints on the document); without this it's left blank
// even though the zip is right there in the address text.
const ZIP_CODE_RE = /\s*(\d{5})\s*$/

function extractZipCode(address?: string): string | undefined {
  return address?.match(ZIP_CODE_RE)?.[1]
}

// Once the zip is captured into its own field above, strip it back out of the free-text
// address — otherwise it prints twice on the document (once in the dedicated field, once
// still trailing the address line).
function stripZipCode(address?: string): string | undefined {
  return address?.replace(ZIP_CODE_RE, '')
}

function buildSellDocument(input: {
  contactName: string
  contactTaxId?: string
  contactAddress?: string
  contactBranch?: string
  contactGroup?: 'individual' | 'juristic'
  publishedOn: string
  remarks?: string
  internalNotes?: string
  items: SellItemInput[]
}) {
  const items = input.items.map((item) => ({
    name: item.name,
    type: 3, // non-inventory
    quantity: item.quantity,
    unitName: item.unitName,
    pricePerUnit: item.pricePerUnit,
    total: round2(item.quantity * item.pricePerUnit),
    sellChartOfAccountCode: item.sellChartOfAccountCode,
  }))
  const subTotal = round2(items.reduce((sum, i) => sum + i.total, 0))
  const vatAmount = round2(subTotal * 0.07)
  const grandTotal = round2(subTotal + vatAmount)

  return {
    recordId: 0,
    documentStructureType: 'SimpleDocument',
    contactName: input.contactName,
    contactTaxId: input.contactTaxId,
    contactAddress: stripZipCode(input.contactAddress),
    contactZipCode: extractZipCode(input.contactAddress),
    contactBranch: input.contactBranch,
    contactGroup: input.contactGroup ? CONTACT_GROUP_CODE[input.contactGroup] : undefined,
    publishedOn: input.publishedOn,
    isVatInclusive: false,
    isVat: true,
    subTotal,
    discountAmount: 0,
    totalAfterDiscount: subTotal,
    vatAmount,
    grandTotal,
    remarks: input.remarks ?? '',
    internalNotes: input.internalNotes ?? '',
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
export interface TaxInvoicePaymentConfig {
  bankAccountId?: number // FlowAccount bank account, resolved from settings.tax_invoice_bank_account_id
  edcChannelId?: number // FlowAccount "other channel" id, from settings.tax_invoice_edc_channel_id
  edcChannelName?: string
}

// bankAccountId/edcChannelId come from Settings (ตั้งค่า > ระบบ), not env vars — staff pick
// them from a live FlowAccount dropdown there, so this stays a pure function of what the
// caller resolved rather than reaching into process.env itself.
export function resolveTaxInvoicePayment(
  method: 'cash' | 'transfer' | 'credit_card',
  paymentDate: string,
  roundingAmount: number,
  config: TaxInvoicePaymentConfig,
): TaxInvoicePayment {
  if (method === 'cash') return { paymentDate, method: 'cash', roundingAmount }
  if (method === 'transfer') {
    if (!config.bankAccountId) throw new Error('ยังไม่ได้ตั้งค่าบัญชีธนาคารสำหรับรับโอนเงินใบกำกับภาษี — ไปตั้งค่าที่หน้าตั้งค่าระบบก่อน')
    return { paymentDate, method: 'transfer', bankAccountId: config.bankAccountId, roundingAmount }
  }
  if (!config.edcChannelId) throw new Error('ยังไม่ได้ตั้งค่าช่องทางเครื่องรูดบัตร EDC สำหรับใบกำกับภาษี — ไปตั้งค่าที่หน้าตั้งค่าระบบก่อน')
  return {
    paymentDate,
    method: 'otherChannel',
    otherChannelId: config.edcChannelId,
    otherChannelType: 5, // EDC
    otherChannelName: config.edcChannelName || 'เครื่องรูดบัตรเครดิต',
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
  internalNotes?: string
  items: SellItemInput[]
  payment?: TaxInvoicePayment
}

const TAX_INVOICE_REVENUE_ACCOUNT_CODE = '41210'

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
  // Customer tax invoices are restaurant service revenue. FlowAccount otherwise defaults
  // non-inventory lines to 41110 (sales of goods), which is the wrong ledger account here.
  // Enforce this at the document boundary so every payment channel uses 41210 consistently.
  const document = buildSellDocument({
    ...input,
    items: input.items.map(item => ({ ...item, sellChartOfAccountCode: TAX_INVOICE_REVENUE_ACCOUNT_CODE })),
  })
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

// Returns base64-encoded PDF bytes — just the one combined ใบกำกับภาษี/ใบเสร็จรับเงิน
// page. Omitting `receipt` (rather than setting it true) is what keeps this to a single
// page: FlowAccount appends a second, separate ใบเสร็จรับเงิน page whenever it's set.
export async function exportTaxInvoicePdfBase64(recordId: number): Promise<string> {
  return flowAccountFetch(`/tax-invoices/${recordId}/export-pdf/base64`, {
    method: 'POST',
    body: JSON.stringify({
      culture: 'th',
      document: { original: true },
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

export async function voidCashInvoice(recordId: number) {
  return flowAccountFetch(`/cash-invoices/${recordId}/status/void`, { method: 'POST' })
}

export async function getCashInvoice(recordId: number) {
  return flowAccountFetch(`/cash-invoices/${recordId}`)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
