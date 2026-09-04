import { extractUrlDocument, expenseBillSchemaVersion } from './ocr/server'
import type { ExpenseBillItemOcrData } from '@anirutwata/ocr-kit'

export type ExtractedBillItem = ExpenseBillItemOcrData

export async function extractItemsFromReceipt(imageUrl: string, categoryNames: string[]): Promise<ExtractedBillItem[] | null> {
  try {
    return (await extractUrlDocument({
      profile: 'expense_bill', url: imageUrl, context: { categoryNames },
      schemaVersion: expenseBillSchemaVersion(categoryNames), actorKey: 'legacy-bill-items',
    })).data.items
  } catch { return null }
}
