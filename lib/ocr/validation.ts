import { BANKS } from '../banks'
import { slipProviderOutputSchema } from './schemas'
import type { SlipOcrData } from './types'

export interface SlipValidationResult {
  data: SlipOcrData | null
  issueCodes: string[]
}

const BANK_ALIASES: Array<[string, string]> = [
  ['KASIKORN', 'กสิกรไทย'], ['KBANK', 'กสิกรไทย'], ['กสิกร', 'กสิกรไทย'],
  ['SIAM COMMERCIAL', 'ไทยพาณิชย์'], ['SCB', 'ไทยพาณิชย์'], ['ไทยพาณิชย์', 'ไทยพาณิชย์'],
  ['BANGKOK BANK', 'กรุงเทพ'], ['BBL', 'กรุงเทพ'], ['กรุงเทพ', 'กรุงเทพ'],
  ['KRUNGTHAI', 'กรุงไทย'], ['KTB', 'กรุงไทย'], ['กรุงไทย', 'กรุงไทย'],
  ['TTB', 'ทหารไทยธนชาต'], ['TMB', 'ทหารไทยธนชาต'], ['ทหารไทย', 'ทหารไทยธนชาต'],
  ['KRUNGSRI', 'กรุงศรีอยุธยา'], ['BAY', 'กรุงศรีอยุธยา'], ['กรุงศรี', 'กรุงศรีอยุธยา'],
  ['GSB', 'ออมสิน'], ['ออมสิน', 'ออมสิน'], ['GHB', 'อาคารสงเคราะห์'],
  ['UOB', 'ยูโอบี'], ['ยูโอบี', 'ยูโอบี'],
]

function normalizeBank(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const upper = trimmed.toUpperCase()
  const match = BANK_ALIASES.find(([alias]) => upper.includes(alias.toUpperCase()))
  if (match) return match[1]
  return BANKS.includes(trimmed) ? trimmed : 'อื่นๆ'
}

function normalizeAmount(value: number): number {
  return value
}

function normalizeDate(value: string): string {
  const trimmed = value.trim()
  let year: number
  let month: number
  let day: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  const thai = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(trimmed)
  if (iso) [, year, month, day] = iso.map(Number)
  else if (thai) [, day, month, year] = thai.map(Number)
  else return ''
  if (year >= 2400) year -= 543
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function isValidTime(value: string): boolean {
  return value === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function normalizeAndValidateSlip(raw: unknown, now = new Date()): SlipValidationResult {
  const parsed = slipProviderOutputSchema.safeParse(raw)
  if (!parsed.success) return { data: null, issueCodes: ['schema_invalid'] }

  const data: SlipOcrData = {
    amount_satang: normalizeAmount(parsed.data.amount_satang),
    date: normalizeDate(parsed.data.date),
    time: parsed.data.time.trim(),
    ref_number: parsed.data.ref_number.trim(),
    sender_name: parsed.data.sender_name.trim(),
    sender_bank: normalizeBank(parsed.data.sender_bank),
    sender_account: parsed.data.sender_account.trim(),
    recipient: parsed.data.recipient.trim(),
    recipient_bank: normalizeBank(parsed.data.recipient_bank),
    recipient_account: parsed.data.recipient_account.trim(),
    confidence: Math.min(1, Math.max(0, parsed.data.confidence)),
  }

  const issueCodes: string[] = []
  if (!Number.isInteger(data.amount_satang) || data.amount_satang <= 0) issueCodes.push('amount_invalid')
  if (!isRealDate(data.date)) issueCodes.push('date_invalid')
  if (isRealDate(data.date)) {
    const slipDate = new Date(`${data.date}T00:00:00+07:00`)
    const futureTolerance = new Date(now.getTime() + 36 * 60 * 60 * 1000)
    if (slipDate > futureTolerance) issueCodes.push('date_too_far_future')
  }
  if (!isValidTime(data.time)) issueCodes.push('time_invalid')
  if (!data.ref_number) issueCodes.push('reference_missing')
  else if (!/^[\p{L}\p{N}._\-\s/]+$/u.test(data.ref_number)) issueCodes.push('reference_format_invalid')
  if (!data.recipient) issueCodes.push('recipient_missing')
  return { data, issueCodes }
}

const BLOCKING_ISSUES = new Set([
  'schema_invalid', 'amount_invalid', 'date_invalid', 'date_too_far_future',
  'time_invalid', 'reference_format_invalid',
])

export function hasBlockingSlipIssues(issueCodes: string[]): boolean {
  return issueCodes.some(code => BLOCKING_ISSUES.has(code))
}
