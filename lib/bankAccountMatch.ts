export interface MatchableBankAccount {
  bank_name: string
  account_number: string
}

function normalizeBank(value: string): string {
  return value.toLocaleLowerCase('th-TH').replace(/[.\s-]/g, '')
}

function visibleDigitGroups(value: string): string[] {
  return value.match(/\d+/g) ?? []
}

export function accountNumbersMatch(stored: string, ocr: string): boolean {
  const storedDigits = stored.replace(/\D/g, '')
  const ocrDigits = ocr.replace(/\D/g, '')
  if (!storedDigits || !ocrDigits) return false
  if (storedDigits === ocrDigits) return true

  const visibleGroups = visibleDigitGroups(ocr).filter(group => group.length >= 3)
  return visibleGroups.some(group => storedDigits.includes(group))
}

export function findBankAccount<T extends MatchableBankAccount>(
  accounts: T[],
  bankName: string,
  accountNumber: string,
): T | undefined {
  if (!bankName) return undefined
  const normalizedBank = normalizeBank(bankName)
  const sameBank = accounts.filter(account => {
    const candidate = normalizeBank(account.bank_name)
    return candidate === normalizedBank || candidate.includes(normalizedBank) || normalizedBank.includes(candidate)
  })

  if (accountNumber) {
    return sameBank.find(account => accountNumbersMatch(account.account_number, accountNumber))
      ?? accounts.find(account => accountNumbersMatch(account.account_number, accountNumber))
  }
  return sameBank.length === 1 ? sameBank[0] : undefined
}
