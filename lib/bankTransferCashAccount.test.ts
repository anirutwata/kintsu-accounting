import { describe, expect, it } from 'vitest'
import { resolveCashJournalAccount } from './bankTransferSync'

describe('resolveCashJournalAccount', () => {
  it('uses FlowAccount 11112 เงินสดคงเหลือ for every KINTSU cash transfer', () => {
    expect(resolveCashJournalAccount([
      { id: 101, code: '11111', nameLocal: 'เงินสดในมือ' },
      { id: 102, code: '11112', nameLocal: 'เงินสดคงเหลือ' },
    ])).toEqual({ chartOfAccountId: 102, label: 'เงินสดคงเหลือ' })
  })

  it('fails instead of silently falling back to a different cash account', () => {
    expect(() => resolveCashJournalAccount([
      { id: 101, code: '11111', nameLocal: 'เงินสดในมือ' },
    ])).toThrow('11112 เงินสดคงเหลือ')
  })
})
