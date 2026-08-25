import { describe, expect, it, vi } from 'vitest'
import { buildRevenueJournal, syncRevenueJournal } from './revenueJournal'

describe('revenue journal', () => {
  it('builds TTB PromptPay revenue as debit TTB and credit service revenue', () => {
    expect(buildRevenueJournal({
      source: 'ttb_promptpay',
      date: '2026-08-24',
      amountSatang: 1_970_800,
      debitAccount: { chartOfAccountId: 449281559, code: '11122.07', label: 'ทหารไทยธนชาต 7602315983' },
      revenueAccount: { chartOfAccountId: 12345, code: '41210', label: 'รายได้จากการให้บริการ' },
    })).toMatchObject({
      documentDate: '2026-08-24',
      documentType: 51,
      reference: 'KINTSU-TTB-20260824',
      bookOfAccounts: [
        { debitCredit: 1, chartOfAccountId: 449281559, value: 19708 },
        {
          debitCredit: 3,
          chartOfAccountId: 12345,
          value: 19708,
          description: 'รายรับพร้อมเพย์ TTB Smart Shop วันที่ 2026-08-24',
        },
      ],
    })
  })

  it('builds cash revenue as debit 11112 and credit 41210', () => {
    expect(buildRevenueJournal({
      source: 'cash',
      date: '2026-08-24',
      amountSatang: 758_400,
      debitAccount: { chartOfAccountId: 209573633, code: '11112', label: 'เงินสดคงเหลือ' },
      revenueAccount: { chartOfAccountId: 12345, code: '41210', label: 'รายได้จากการให้บริการ' },
    }).bookOfAccounts).toEqual([
      expect.objectContaining({ debitCredit: 1, chartOfAccountId: 209573633, value: 7584 }),
      expect.objectContaining({
        debitCredit: 3,
        chartOfAccountId: 12345,
        value: 7584,
        description: 'รายรับเงินสด วันที่ 2026-08-24',
      }),
    ])
  })

  it('returns the existing JV without creating a duplicate', async () => {
    const createApprovedJournal = vi.fn()
    const result = await syncRevenueJournal({
      source: 'ttb_promptpay', date: '2026-08-24', amountSatang: 1_970_800,
      debitAccount: { chartOfAccountId: 1, code: '11122.07', label: 'TTB' },
      revenueAccount: { chartOfAccountId: 2, code: '41210', label: 'รายได้จากการให้บริการ' },
      flowAccountRecordId: 263011073, flowAccountDocumentSerial: 'JV2026080099',
    }, { createApprovedJournal })

    expect(result).toEqual({ recordId: 263011073, documentSerial: 'JV2026080099', created: false })
    expect(createApprovedJournal).not.toHaveBeenCalled()
  })
})
