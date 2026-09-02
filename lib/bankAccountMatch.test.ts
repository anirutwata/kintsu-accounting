import { describe, expect, it } from 'vitest'
import { accountNumbersMatch, findBankAccount } from './bankAccountMatch'

const accounts = [
  { id: 'recipient', bank_name: 'กสิกรไทย', account_number: '039-1-72208-0', account_name: 'Anirut' },
  { id: 'sender', bank_name: 'กสิกรไทย', account_number: '111-2-35555-6', account_name: 'Company' },
]

describe('bank account matching', () => {
  it('matches a masked OCR account by its visible trailing digits', () => {
    expect(accountNumbersMatch('111-2-35555-6', 'xxx-x-x5555-x')).toBe(true)
    expect(findBankAccount(accounts, 'กสิกรไทย', 'xxx-x-x5555-x')?.id).toBe('sender')
  })

  it('never guesses the first same-bank account when visible digits do not match', () => {
    expect(findBankAccount(accounts.slice(0, 1), 'กสิกรไทย', 'xxx-x-x5555-x')).toBeUndefined()
  })

  it('may use the sole bank account only when OCR supplied no account number', () => {
    expect(findBankAccount(accounts.slice(0, 1), 'กสิกรไทย', '')?.id).toBe('recipient')
  })
})
