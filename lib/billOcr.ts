import { extractUrlDocument, expenseBillSchemaVersion } from './ocr/server'
import type { ExpenseBillOcrData, TaxInvoiceBillOcrData } from './ocr/types'

export { parseTaxInvoiceBillJson } from './ocr/profiles/taxInvoiceBill'
export type ExtractedBillVat = Pick<ExpenseBillOcrData, 'hasVat' | 'vatSatang' | 'vatInclusive' | 'hasWht' | 'whtSatang' | 'hasDiscount' | 'discountSatang' | 'totalSatang' | 'confidence'>
export type ExtractedTaxInvoiceBill = TaxInvoiceBillOcrData

export async function extractVatFromReceipt(imageUrl: string): Promise<ExtractedBillVat | null> {
  try {
    return (await extractUrlDocument({
      profile: 'expense_bill', url: imageUrl, context: { categoryNames: [] },
      schemaVersion: expenseBillSchemaVersion([]), actorKey: 'legacy-bill-vat',
    })).data
  } catch { return null }
}

export async function extractTaxInvoiceFieldsFromBill(imageUrl: string): Promise<ExtractedTaxInvoiceBill | null> {
  try {
    return (await extractUrlDocument({ profile: 'tax_invoice_bill', url: imageUrl, actorKey: 'legacy-tax-invoice-bill' })).data
  } catch { return null }
}
