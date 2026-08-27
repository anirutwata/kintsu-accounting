interface TaxInvoiceRequestKey {
  documentDate: string
  contactTaxId: string | null
  contactName: string
  totalSatang: number
}

function normalizedTaxId(value: string | null): string {
  return String(value || '').replace(/[^0-9]/g, '')
}

function normalizedCompanyName(value: string): string {
  return value.trim().toLocaleLowerCase('th-TH').replace(/\s+/g, ' ')
}

export function isDuplicateTaxInvoiceRequest(
  existing: TaxInvoiceRequestKey,
  incoming: TaxInvoiceRequestKey,
): boolean {
  const existingTaxId = normalizedTaxId(existing.contactTaxId)
  const incomingTaxId = normalizedTaxId(incoming.contactTaxId)
  const sameCompany = existingTaxId && incomingTaxId
    ? existingTaxId === incomingTaxId
    : normalizedCompanyName(existing.contactName) === normalizedCompanyName(incoming.contactName)
  return existing.documentDate === incoming.documentDate
    && existing.totalSatang === incoming.totalSatang
    && sameCompany
}

export const DUPLICATE_TAX_INVOICE_REQUEST_MESSAGE =
  'มีคำขอใบกำกับภาษีของบริษัทนี้ในวันและยอดเดียวกันแล้ว กรุณาตรวจสอบประวัติคำขอก่อนส่งซ้ำ'
