import type { FlowAccountJournalPayload } from './bankTransferJournal'
import type { CreateCashInvoiceInput } from './flowaccount'
import { LINEPAY_EDC_POLICY } from './edcPolicy'

export interface EdcAccount {
  chartOfAccountId: number
  code: string
  label: string
}

export interface EdcCashSaleInput {
  revenueDate: string
  grossAmountSatang: number
  edcChannelId: number
  edcChannelName: string
}

export interface EdcSettlementInput {
  settlementDate: string
  grossAmountSatang: number
  feeAmountSatang: number
  feeVatSatang: number
  netAmountSatang: number
  bank: EdcAccount
  fee: EdcAccount
  pendingVat: EdcAccount
  edcClearing: EdcAccount
}

function assertPositiveSatang(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}ต้องมากกว่า 0 บาท`)
}

function priceBeforeVat(grossAmountSatang: number): number {
  const estimate = Math.round((grossAmountSatang * 100) / 107)
  for (const candidate of [estimate, estimate - 1, estimate + 1]) {
    if (candidate + Math.round(candidate * 0.07) === grossAmountSatang) return candidate / 100
  }
  throw new Error('ไม่สามารถแยก VAT 7% จากยอด EDC ได้พอดี')
}

export function buildEdcCashSale(input: EdcCashSaleInput): CreateCashInvoiceInput {
  assertPositiveSatang(input.grossAmountSatang, 'ยอดขาย EDC')
  if (!input.edcChannelId || !input.edcChannelName.trim()) throw new Error('ยังไม่ได้ตั้งค่าช่องทาง EDC ใน FlowAccount')
  const description = `รายได้ EDC LINE Pay วันที่ ${input.revenueDate}`
  return {
    contactName: 'Cash Sale / ขายเงินสด',
    publishedOn: input.revenueDate,
    remarks: description,
    items: [{
      name: description,
      quantity: 1,
      unitName: 'วัน',
      pricePerUnit: priceBeforeVat(input.grossAmountSatang),
      sellChartOfAccountCode: LINEPAY_EDC_POLICY.accountCodes.revenue,
    }],
    payment: {
      paymentDate: input.revenueDate,
      method: 'otherChannel',
      otherChannelId: input.edcChannelId,
      otherChannelType: 5,
      otherChannelName: input.edcChannelName,
      roundingAmount: 0,
    },
  }
}

export function buildEdcSettlementJournal(input: EdcSettlementInput): FlowAccountJournalPayload {
  assertPositiveSatang(input.grossAmountSatang, 'ยอดขาย EDC')
  if (input.netAmountSatang + input.feeAmountSatang + input.feeVatSatang !== input.grossAmountSatang) {
    throw new Error('ยอด Settlement EDC ไม่สมดุล')
  }
  const requiredCodes: Array<[EdcAccount, string]> = [
    [input.bank, LINEPAY_EDC_POLICY.accountCodes.bank],
    [input.fee, LINEPAY_EDC_POLICY.accountCodes.fee],
    [input.pendingVat, LINEPAY_EDC_POLICY.accountCodes.pendingVat],
    [input.edcClearing, LINEPAY_EDC_POLICY.accountCodes.edcClearing],
  ]
  for (const [account, code] of requiredCodes) {
    if (account.code !== code) throw new Error(`บัญชี EDC Settlement ต้องใช้รหัส ${code}`)
  }
  const toBaht = (value: number) => value / 100
  return {
    description: `Settlement EDC LINE Pay วันที่ ${input.settlementDate}`,
    documentDate: input.settlementDate,
    documentType: 51,
    remarks: 'บันทึกยอดสุทธิและค่าธรรมเนียมจากรายงาน LINE Pay EDC',
    note: 'สร้างจาก KINTSU Accounting',
    reference: `KINTSU-EDC-${input.settlementDate.replaceAll('-', '')}`,
    contactName: 'KINTSU Accounting',
    bookOfAccounts: [
      { debitCredit: 1, chartOfAccountId: input.bank.chartOfAccountId, value: toBaht(input.netAmountSatang), description: `รับยอดสุทธิเข้า ${input.bank.label}` },
      { debitCredit: 1, chartOfAccountId: input.fee.chartOfAccountId, value: toBaht(input.feeAmountSatang), description: 'ค่าธรรมเนียม LINE Pay EDC ก่อน VAT' },
      { debitCredit: 1, chartOfAccountId: input.pendingVat.chartOfAccountId, value: toBaht(input.feeVatSatang), description: 'ภาษีซื้อรอใบกำกับภาษีจาก LINE Pay' },
      { debitCredit: 3, chartOfAccountId: input.edcClearing.chartOfAccountId, value: toBaht(input.grossAmountSatang), description: `ล้างยอด ${input.edcClearing.label}` },
    ],
  }
}
