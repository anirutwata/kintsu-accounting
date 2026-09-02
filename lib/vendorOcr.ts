import { extractUrlDocument, expenseBillSchemaVersion } from './ocr/server'

export interface ExtractedVendorInfo { name: string; address: string; taxId: string; branch: string }

export async function extractVendorInfoFromReceipt(imageUrl: string): Promise<ExtractedVendorInfo | null> {
  try {
    const result = await extractUrlDocument({
      profile: 'expense_bill', url: imageUrl, context: { categoryNames: [] },
      schemaVersion: expenseBillSchemaVersion([]), actorKey: 'flowaccount-expense-sync',
    })
    return result.data.vendor.address ? result.data.vendor : null
  } catch { return null }
}
