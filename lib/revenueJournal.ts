import type { FlowAccountJournalPayload } from './bankTransferJournal'

export type RevenueSource = 'cash' | 'ttb_promptpay'

export interface RevenueJournalAccount {
  chartOfAccountId: number
  code: string
  label: string
}

export interface RevenueJournalInput {
  source: RevenueSource
  date: string
  amountSatang: number
  debitAccount: RevenueJournalAccount
  revenueAccount: RevenueJournalAccount
}

export interface SyncableRevenueJournal extends RevenueJournalInput {
  flowAccountRecordId?: number | null
  flowAccountDocumentSerial?: string | null
}

export interface RevenueJournalDependencies {
  createApprovedJournal(payload: FlowAccountJournalPayload): Promise<{
    recordId: number
    documentSerial: string
  }>
}

const SOURCE_TEXT: Record<RevenueSource, { title: string; reference: string }> = {
  cash: { title: 'รายรับเงินสด', reference: 'CASH' },
  ttb_promptpay: { title: 'รายรับพร้อมเพย์ TTB Smart Shop', reference: 'TTB' },
}

export function buildRevenueJournal(input: RevenueJournalInput): FlowAccountJournalPayload {
  if (!Number.isInteger(input.amountSatang) || input.amountSatang <= 0) {
    throw new Error('ยอดรายรับต้องมากกว่า 0 บาท')
  }
  if (input.revenueAccount.code !== '41210') {
    throw new Error('บัญชีรายได้ต้องเป็น 41210 รายได้จากการให้บริการ')
  }
  if (input.source === 'cash' && input.debitAccount.code !== '11112') {
    throw new Error('รายรับเงินสดต้องเดบิต 11112 เงินสดคงเหลือ')
  }
  if (input.source === 'ttb_promptpay' && input.debitAccount.code !== '11122.07') {
    throw new Error('รายรับพร้อมเพย์ต้องเดบิต 11122.07 ทหารไทยธนชาต 7602315983')
  }

  const source = SOURCE_TEXT[input.source]
  const value = input.amountSatang / 100
  return {
    description: `${source.title} วันที่ ${input.date}`,
    documentDate: input.date,
    documentType: 51,
    remarks: `บันทึกจาก KINTSU Accounting · ${source.title}`,
    note: 'สร้างจาก KINTSU Accounting',
    reference: `KINTSU-${source.reference}-${input.date.replaceAll('-', '')}`,
    contactName: 'KINTSU Accounting',
    bookOfAccounts: [
      {
        debitCredit: 1,
        chartOfAccountId: input.debitAccount.chartOfAccountId,
        value,
        description: `รับเงินเข้า ${input.debitAccount.label}`,
      },
      {
        debitCredit: 3,
        chartOfAccountId: input.revenueAccount.chartOfAccountId,
        value,
        description: input.revenueAccount.label,
      },
    ],
  }
}

export async function syncRevenueJournal(
  input: SyncableRevenueJournal,
  dependencies: RevenueJournalDependencies,
): Promise<{ recordId: number; documentSerial: string; created: boolean }> {
  if (input.flowAccountRecordId && input.flowAccountDocumentSerial) {
    return {
      recordId: input.flowAccountRecordId,
      documentSerial: input.flowAccountDocumentSerial,
      created: false,
    }
  }
  const created = await dependencies.createApprovedJournal(buildRevenueJournal(input))
  return { recordId: created.recordId, documentSerial: created.documentSerial, created: true }
}
