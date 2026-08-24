export interface JournalAccount {
  chartOfAccountId: number
  label: string
}

export interface BankTransferJournalInput {
  id: string
  date: string
  amountSatang: number
  from: JournalAccount
  to: JournalAccount
  note?: string | null
}

export interface SyncableBankTransfer extends BankTransferJournalInput {
  flowAccountRecordId?: number | null
  flowAccountDocumentSerial?: string | null
}

export interface BankTransferJournalDependencies {
  createApprovedJournal(payload: FlowAccountJournalPayload): Promise<{
    recordId: number
    documentSerial: string
  }>
}

export interface FlowAccountJournalPayload {
  description: string
  documentDate: string
  documentType: 51
  remarks: string
  note: string
  reference: string
  contactName: string
  bookOfAccounts: Array<{
    debitCredit: 1 | 3
    chartOfAccountId: number
    value: number
    description: string
  }>
}

export function buildBankTransferJournal(input: BankTransferJournalInput): FlowAccountJournalPayload {
  const amountBaht = input.amountSatang / 100
  return {
    description: `โอนเงิน ${input.from.label} → ${input.to.label}`,
    documentDate: input.date,
    documentType: 51,
    remarks: input.note?.trim() || '',
    note: 'สร้างจาก KINTSU Accounting',
    // FlowAccount Production returns an opaque 500 for long references even
    // though OpenAPI does not document a maximum length.
    reference: `KINTSU-${input.id.slice(0, 8)}`,
    // Despite the OpenAPI description saying JV does not require a contact,
    // FlowAccount Production rejects /journal-entries/approve when this is blank.
    contactName: 'KINTSU Accounting',
    bookOfAccounts: [
      {
        debitCredit: 1,
        chartOfAccountId: input.to.chartOfAccountId,
        value: amountBaht,
        description: `รับโอนจาก ${input.from.label}`,
      },
      {
        debitCredit: 3,
        chartOfAccountId: input.from.chartOfAccountId,
        value: amountBaht,
        description: `โอนไป ${input.to.label}`,
      },
    ],
  }
}

export async function syncBankTransferJournal(
  transfer: SyncableBankTransfer,
  dependencies: BankTransferJournalDependencies,
): Promise<{ recordId: number; documentSerial: string; created: boolean }> {
  if (transfer.flowAccountRecordId && transfer.flowAccountDocumentSerial) {
    return {
      recordId: transfer.flowAccountRecordId,
      documentSerial: transfer.flowAccountDocumentSerial,
      created: false,
    }
  }

  const journal = await dependencies.createApprovedJournal(buildBankTransferJournal(transfer))
  return {
    recordId: journal.recordId,
    documentSerial: journal.documentSerial,
    created: true,
  }
}
