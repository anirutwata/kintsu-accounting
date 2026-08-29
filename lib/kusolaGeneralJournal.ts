import { createApprovedJournal, getChartOfAccounts, voidJournalEntry } from '@/lib/flowaccount'
import type { FlowAccountJournalPayload } from '@/lib/bankTransferJournal'

export interface KusolaJournalLine {
  debitCredit: 'debit' | 'credit'
  chartOfAccountId: number
  accountCode: string
  accountName: string
  amountSatang: number
  description: string
}

export interface KusolaJournalInput {
  id: string
  date: string
  description: string
  reference: string
  remarks: string
  note: string
  contactName: string
  lines: KusolaJournalLine[]
}

export function buildKusolaFlowAccountJournal(input: KusolaJournalInput): FlowAccountJournalPayload {
  const debit = input.lines.filter(line => line.debitCredit === 'debit').reduce((sum, line) => sum + line.amountSatang, 0)
  const credit = input.lines.filter(line => line.debitCredit === 'credit').reduce((sum, line) => sum + line.amountSatang, 0)
  if (debit <= 0 || debit !== credit) throw new Error('ยอดเดบิตและเครดิตต้องเท่ากันและมากกว่าศูนย์')
  return {
    description: input.description.trim(), documentDate: input.date, documentType: 51,
    remarks: input.remarks.trim(), note: input.note.trim(), reference: input.reference.trim().slice(0, 32),
    contactName: input.contactName.trim() || 'KINTSU Accounting',
    bookOfAccounts: input.lines.map(line => ({
      debitCredit: line.debitCredit === 'debit' ? 1 as const : 3 as const,
      chartOfAccountId: line.chartOfAccountId, value: line.amountSatang / 100,
      description: line.description.trim(),
    })),
  }
}

export async function syncKusolaJournal(input: KusolaJournalInput) {
  return createApprovedJournal(buildKusolaFlowAccountJournal(input))
}

export async function voidKusolaJournal(recordId: number) { return voidJournalEntry(recordId) }

export async function fetchKusolaChart() { return getChartOfAccounts() }
