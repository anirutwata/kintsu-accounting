import type { FlowAccountJournalPayload } from './bankTransferJournal'
import type { TaxInvoicePaymentMethod } from './taxInvoiceDedupPolicy'

interface AdjustmentAccount {
  chartOfAccountId: number
  code: string
  label: string
}

interface TaxInvoiceRevenueReversalInput {
  requestId: string
  documentDate: string
  paymentMethod: TaxInvoicePaymentMethod
  totalSatang: number
  invoiceSerial: string
  accounts: {
    revenue: AdjustmentAccount
    cash: AdjustmentAccount
    transfer: AdjustmentAccount
  }
}

export function buildTaxInvoiceRevenueReversal(input: TaxInvoiceRevenueReversalInput): FlowAccountJournalPayload {
  if (input.paymentMethod === 'credit_card') {
    throw new Error('EDC ต้องปรับเอกสาร Cash Sale ไม่ใช่สร้าง reversal JV')
  }
  if (!Number.isInteger(input.totalSatang) || input.totalSatang <= 0) {
    throw new Error('ยอดใบกำกับภาษีต้องมากกว่า 0 บาท')
  }
  if (input.accounts.revenue.code !== '41210') {
    throw new Error('บัญชีรายได้ต้องเป็น 41210 รายได้จากการให้บริการ')
  }
  const receiving = input.paymentMethod === 'cash' ? input.accounts.cash : input.accounts.transfer
  const requiredReceivingCode = input.paymentMethod === 'cash' ? '11112' : '11122.07'
  if (receiving.code !== requiredReceivingCode) {
    throw new Error(`บัญชีรับเงินต้องเป็น ${requiredReceivingCode}`)
  }

  const value = input.totalSatang / 100
  const channel = input.paymentMethod === 'cash' ? 'เงินสด' : 'เงินโอน TTB'
  return {
    description: `ปรับรายได้ออกใบกำกับภาษีเต็มรูป ${input.invoiceSerial}`,
    documentDate: input.documentDate,
    documentType: 51,
    remarks: `หักยอด${channel}เดิมที่เปลี่ยนเป็นใบกำกับภาษีเต็มรูป ${input.invoiceSerial}`,
    note: `สร้างจาก KINTSU Accounting · tax invoice request ${input.requestId}`,
    reference: `KINTSU-TIR-${input.requestId.slice(0, 8)}`,
    contactName: 'KINTSU Accounting',
    bookOfAccounts: [
      {
        debitCredit: 1,
        chartOfAccountId: input.accounts.revenue.chartOfAccountId,
        value,
        description: `หักรายได้เดิมที่ออกซ้ำกับ ${input.invoiceSerial}`,
      },
      {
        debitCredit: 3,
        chartOfAccountId: receiving.chartOfAccountId,
        value,
        description: `หักยอดรับ${channel}เดิมที่แทนด้วย ${input.invoiceSerial}`,
      },
    ],
  }
}
