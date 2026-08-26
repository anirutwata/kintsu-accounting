import { describe, expect, it } from 'vitest'
import { buildEdcCashSale, buildEdcSettlementJournal } from './edcAccounting'

describe('LINE Pay EDC accounting', () => {
  it('builds a VAT-inclusive Cash Sale paid into the configured EDC channel', () => {
    expect(buildEdcCashSale({
      revenueDate: '2026-08-24',
      grossAmountSatang: 945_100,
      edcChannelId: 434479632,
      edcChannelName: 'เครื่องรูดบัตรเครดิต (EDC) - 88122653',
    })).toEqual({
      contactName: 'Cash Sale / ขายเงินสด',
      publishedOn: '2026-08-24',
      remarks: 'รายได้ EDC LINE Pay วันที่ 2026-08-24',
      items: [{
        name: 'รายได้ EDC LINE Pay วันที่ 2026-08-24',
        quantity: 1,
        unitName: 'วัน',
        pricePerUnit: 8832.71,
        sellChartOfAccountCode: '41210',
      }],
      payment: {
        paymentDate: '2026-08-24', method: 'otherChannel', otherChannelId: 434479632,
        otherChannelType: 5, otherChannelName: 'เครื่องรูดบัตรเครดิต (EDC) - 88122653', roundingAmount: 0,
      },
    })
  })

  it('uses a one-satang receipt rounding when the VAT-inclusive gross is not exactly representable', () => {
    const cashSale = buildEdcCashSale({
      revenueDate: '2026-08-13',
      grossAmountSatang: 1_062_900,
      edcChannelId: 434479632,
      edcChannelName: 'เครื่องรูดบัตรเครดิต (EDC) - 88122653',
    })

    expect(cashSale.items[0].pricePerUnit).toBe(9_933.65)
    expect(cashSale.payment?.roundingAmount).toBe(0.01)
  })

  it('builds a balanced settlement JV using the required chart accounts', () => {
    const journal = buildEdcSettlementJournal({
      settlementDate: '2026-08-25', grossAmountSatang: 945_100,
      feeAmountSatang: 23_891, feeVatSatang: 1_673, netAmountSatang: 919_536,
      bank: { chartOfAccountId: 1, code: '11121.01', label: 'กสิกรไทย 1608755558' },
      fee: { chartOfAccountId: 2, code: '53212', label: 'ค่าธรรมเนียมบัตรเครดิต' },
      pendingVat: { chartOfAccountId: 3, code: '17115', label: 'ภาษีซื้อ รอใบกำกับภาษีจาก LINE Pay' },
      edcClearing: { chartOfAccountId: 4, code: '11379.01', label: 'เครื่องรูดบัตรเครดิต (EDC) - 88122653' },
    })

    expect(journal).toMatchObject({
      documentDate: '2026-08-25', documentType: 51, reference: 'KINTSU-EDC-20260825',
      bookOfAccounts: [
        { debitCredit: 1, chartOfAccountId: 1, value: 9195.36 },
        { debitCredit: 1, chartOfAccountId: 2, value: 238.91 },
        { debitCredit: 1, chartOfAccountId: 3, value: 16.73 },
        { debitCredit: 3, chartOfAccountId: 4, value: 9451 },
      ],
    })
  })
})
