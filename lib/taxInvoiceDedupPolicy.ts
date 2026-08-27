export type TaxInvoicePaymentMethod = 'cash' | 'transfer' | 'credit_card'

export type TaxInvoiceDedupAction =
  | 'reversal_journal'
  | 'reduce_future_revenue_journal'
  | 'reduce_future_edc_cash_sale'
  | 'replace_edc_cash_sale'
  | 'manual_review_closed_vat_period'

export interface TaxInvoiceDedupInput {
  paymentMethod: TaxInvoicePaymentMethod
  documentDate: string
  today: string
  totalSatang: number
  authoritativeSatang: number
  allocatedSatang: number
  sourceRevenueJournalExists: boolean
  edcCashSaleExists: boolean
}

const PAYMENT_LABEL: Record<TaxInvoicePaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'เงินโอน',
  credit_card: 'EDC',
}

export function planTaxInvoiceDedup(input: TaxInvoiceDedupInput): {
  action: TaxInvoiceDedupAction
  remainingSatang: number
} {
  const remainingSatang = input.authoritativeSatang - input.allocatedSatang - input.totalSatang
  if (remainingSatang < 0) {
    throw new Error(`ยอดใบกำกับภาษีรวมเกินยอด${PAYMENT_LABEL[input.paymentMethod]}ของวันที่ ${input.documentDate}`)
  }

  if (input.paymentMethod !== 'credit_card') {
    return {
      action: input.sourceRevenueJournalExists ? 'reversal_journal' : 'reduce_future_revenue_journal',
      remainingSatang,
    }
  }
  if (input.documentDate.slice(0, 7) !== input.today.slice(0, 7)) {
    return { action: 'manual_review_closed_vat_period', remainingSatang }
  }
  return {
    action: input.edcCashSaleExists ? 'replace_edc_cash_sale' : 'reduce_future_edc_cash_sale',
    remainingSatang,
  }
}
