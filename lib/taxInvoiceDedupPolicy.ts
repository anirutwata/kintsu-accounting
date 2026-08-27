export type TaxInvoicePaymentMethod = 'cash' | 'transfer' | 'credit_card'

export type TaxInvoiceDedupAction =
  | 'reversal_journal'
  | 'reduce_future_revenue_journal'
  | 'reduce_future_edc_cash_sale'
  | 'replace_edc_cash_sale'
  | 'manual_review_closed_vat_period'
  | 'pending_edc_report'
  | 'pending_cash_sales'
  | 'pending_ttb_report'

export interface TaxInvoiceDedupInput {
  paymentMethod: TaxInvoicePaymentMethod
  documentDate: string
  today: string
  totalSatang: number
  // null when the LINE Pay EDC settlement report for documentDate hasn't been imported yet.
  authoritativeSatang: number | null
  allocatedSatang: number
  sourceRevenueJournalExists: boolean
  edcCashSaleExists: boolean
}

const PAYMENT_LABEL: Record<TaxInvoicePaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'เงินโอน',
  credit_card: 'EDC',
}

function daysBetween(from: string, to: string): number {
  const toUtcDays = (date: string) => {
    const [year, month, day] = date.split('-').map(Number)
    return Date.UTC(year, month - 1, day) / 86_400_000
  }
  return toUtcDays(to) - toUtcDays(from)
}

export function planTaxInvoiceDedup(input: TaxInvoiceDedupInput): {
  action: TaxInvoiceDedupAction
  remainingSatang: number | null
} {
  if (input.authoritativeSatang === null && daysBetween(input.documentDate, input.today) <= 1) {
    // Matches reserve_tax_invoice_revenue_v3's window: not just requests made the same
    // day as the sale, but also the day after (e.g. a request made after midnight for
    // yesterday's receipt, before that day's cash/TTB source has landed).
    if (input.paymentMethod === 'cash') return { action: 'pending_cash_sales', remainingSatang: null }
    if (input.paymentMethod === 'transfer') return { action: 'pending_ttb_report', remainingSatang: null }
  }
  if (input.paymentMethod === 'credit_card' && !input.authoritativeSatang
    && daysBetween(input.documentDate, input.today) <= 1) {
    // The settlement report always lags a day behind the sale — this is not a
    // missing-data error, just the normal gap before it arrives.
    return { action: 'pending_edc_report', remainingSatang: null }
  }

  const authoritativeSatang = input.authoritativeSatang ?? 0
  const remainingSatang = authoritativeSatang - input.allocatedSatang - input.totalSatang
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
