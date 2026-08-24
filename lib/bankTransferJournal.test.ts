import { describe, expect, it } from 'vitest'
import { buildBankTransferJournal, syncBankTransferJournal } from './bankTransferJournal'

describe('buildBankTransferJournal', () => {
  it('debits the destination and credits the source for the same transfer amount', () => {
    expect(buildBankTransferJournal({
      id: '9b00c62c-b7bd-45ca-b6b1-850bd29b4c21',
      date: '2026-08-24',
      amountSatang: 123456,
      from: { chartOfAccountId: 101, label: 'เงินสดในมือ' },
      to: { chartOfAccountId: 202, label: 'กสิกรไทย 1608755558' },
      note: 'นำฝากยอดขาย',
    })).toEqual({
      description: 'โอนเงิน เงินสดในมือ → กสิกรไทย 1608755558',
      documentDate: '2026-08-24',
      documentType: 51,
      remarks: 'นำฝากยอดขาย',
      note: 'สร้างจาก KINTSU Accounting',
      reference: 'KINTSU-9b00c62c',
      contactName: 'KINTSU Accounting',
      bookOfAccounts: [
        {
          debitCredit: 1,
          chartOfAccountId: 202,
          value: 1234.56,
          description: 'รับโอนจาก เงินสดในมือ',
        },
        {
          debitCredit: 3,
          chartOfAccountId: 101,
          value: 1234.56,
          description: 'โอนไป กสิกรไทย 1608755558',
        },
      ],
    })
  })
})

describe('syncBankTransferJournal', () => {
  it('returns the existing FlowAccount journal without creating a duplicate', async () => {
    let createCalls = 0
    const result = await syncBankTransferJournal({
      id: '9b00c62c-b7bd-45ca-b6b1-850bd29b4c21',
      date: '2026-08-24',
      amountSatang: 123456,
      from: { chartOfAccountId: 101, label: 'เงินสดในมือ' },
      to: { chartOfAccountId: 202, label: 'กสิกรไทย 1608755558' },
      flowAccountRecordId: 987,
      flowAccountDocumentSerial: 'JV2026080012',
    }, {
      createApprovedJournal: async () => {
        createCalls += 1
        return { recordId: 999, documentSerial: 'JV2026080013' }
      },
    })

    expect(result).toEqual({ recordId: 987, documentSerial: 'JV2026080012', created: false })
    expect(createCalls).toBe(0)
  })
})
