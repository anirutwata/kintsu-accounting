import { describe, expect, it, vi } from 'vitest'
import { createConfiguredProviders, createOcrCacheKey, extractDocument, OcrError, validateImage } from '.'
import type { OcrCache, OcrProvider, OcrUsageRecorder, ProviderResult } from './types'
import { toLegacyOcrResponse } from './routeResponse'
import { providerErrorCategory } from './providers/errors'
import { createOcrSessionToken, verifyOcrSessionToken } from './session'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const image = { bytes: jpeg, mimeType: 'image/jpeg' as const }
const valid = {
  amount_satang: 150000,
  date: '2026-08-28',
  time: '14:30',
  ref_number: 'TX-123',
  sender_name: 'สมชาย',
  sender_bank: 'KBANK',
  sender_account: 'xxx-x-12345-x',
  recipient: 'บริษัท คิวโซลา จำกัด',
  recipient_bank: 'SCB',
  confidence: 0.94,
}

const validTaxInvoiceBill = {
  date_found: true,
  date_day: 1,
  date_month: 9,
  date_year_ce: 2026,
  subtotal_found: true,
  subtotal_baht: 1268,
  total_found: true,
  total_baht: 1356,
  payment_method_found: true,
  payment_method: 'credit_card',
  confidence: 0.95,
}

const validExpenseBill = {
  has_vat: true, vat_baht: 88, vat_inclusive: false,
  has_wht: true, wht_baht: 38, has_discount: true, discount_baht: 100,
  total_baht: 1356, confidence: 0.93,
  items: [{ description: 'กระดาษ A4', quantity: 2, unit: 'รีม', price_per_unit: 634, suggested_category: 'อุปกรณ์สำนักงาน' }],
  vendor_name: 'บริษัท ตัวอย่าง จำกัด', vendor_address: 'กรุงเทพฯ 10110',
  vendor_tax_id: '0105559999999', vendor_branch: 'สำนักงานใหญ่',
}

function provider(name: 'gemini' | 'anthropic', model: string, result: unknown): OcrProvider & { extract: ReturnType<typeof vi.fn> } {
  return {
    name,
    model,
    fallbackLevel: name === 'anthropic' ? 2 : model.endsWith('flash-lite') ? 0 : 1,
    extract: vi.fn(async (): Promise<ProviderResult> => {
      if (result instanceof Error) throw result
      return { data: result, usage: { inputTokens: 100, outputTokens: 40 }, latencyMs: 12 }
    }),
  }
}

describe('extractDocument', () => {
  it('extracts every tax-invoice bill field in one Gemini Flash-Lite call', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', validTaxInvoiceBill)
    const secondary = provider('gemini', 'gemini-2.5-flash', validTaxInvoiceBill)
    const result = await extractDocument({ profile: 'tax_invoice_bill', image, providers: [primary, secondary] })
    expect(result.data).toEqual({
      documentDate: '2026-09-01', subtotalBaht: 1268, totalBaht: 1356,
      paymentMethod: 'credit_card', confidence: 0.95,
    })
    expect(primary.extract).toHaveBeenCalledOnce()
    expect(primary.extract).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 2048 }))
    expect(secondary.extract).not.toHaveBeenCalled()
  })

  it('uses a validated tax-invoice bill cache without calling a provider', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', validTaxInvoiceBill)
    const cache: OcrCache = { get: vi.fn().mockResolvedValue({
      data: { documentDate: '2026-09-01', subtotalBaht: 1268, totalBaht: 1356, paymentMethod: 'credit_card', confidence: 0.95 },
      metadata: { provider: 'gemini', model: 'gemini-2.5-flash-lite', fallbackLevel: 0 },
    }), save: vi.fn() } as unknown as OcrCache
    const result = await extractDocument({ profile: 'tax_invoice_bill', image, providers: [primary], cache })
    expect(result.cached).toBe(true)
    expect(primary.extract).not.toHaveBeenCalled()
  })

  it('extracts expense taxes and line items in one Gemini Flash-Lite call', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', validExpenseBill)
    const result = await extractDocument({
      profile: 'expense_bill', image, providers: [primary],
      context: { categoryNames: ['อุปกรณ์สำนักงาน', 'วัตถุดิบ'] },
    })
    expect(result.data).toEqual({
      hasVat: true, vatSatang: 8800, vatInclusive: false,
      hasWht: true, whtSatang: 3800, hasDiscount: true, discountSatang: 10000,
      totalSatang: 135600, confidence: 0.93,
      vendor: { name: 'บริษัท ตัวอย่าง จำกัด', address: 'กรุงเทพฯ 10110', taxId: '0105559999999', branch: 'สำนักงานใหญ่' },
      items: [{ description: 'กระดาษ A4', quantity: 2, unit: 'รีม', pricePerUnit: 634, suggestedCategory: 'อุปกรณ์สำนักงาน' }],
    })
    expect(primary.extract).toHaveBeenCalledOnce()
  })

  it('uses a validated expense-bill cache without calling a provider', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', validExpenseBill)
    const cached = {
      hasVat: true, vatSatang: 8800, vatInclusive: false,
      hasWht: true, whtSatang: 3800, hasDiscount: true, discountSatang: 10000,
      totalSatang: 135600, confidence: 0.93,
      vendor: { name: 'บริษัท ตัวอย่าง จำกัด', address: 'กรุงเทพฯ 10110', taxId: '0105559999999', branch: 'สำนักงานใหญ่' },
      items: [{ description: 'กระดาษ A4', quantity: 2, unit: 'รีม', pricePerUnit: 634, suggestedCategory: 'อุปกรณ์สำนักงาน' }],
    }
    const cache: OcrCache = { get: vi.fn().mockResolvedValue({ data: cached, metadata: {} }), save: vi.fn() } as unknown as OcrCache
    const result = await extractDocument({
      profile: 'expense_bill', image, providers: [primary], cache,
      context: { categoryNames: ['อุปกรณ์สำนักงาน'] },
    })
    expect(result.cached).toBe(true)
    expect(primary.extract).not.toHaveBeenCalled()
  })

  it('stops after Gemini Flash-Lite succeeds', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', valid)
    const secondary = provider('gemini', 'gemini-2.5-flash', valid)
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary, secondary], now: new Date('2026-08-28T12:00:00Z') })
    expect(result.data.amount_satang).toBe(150000)
    expect(result.metadata.fallbackLevel).toBe(0)
    expect(secondary.extract).not.toHaveBeenCalled()
  })

  it.each([
    ['provider error', new OcrError('provider_error', 'secret must not leak')],
    ['timeout', new OcrError('timeout', 'timed out')],
    ['unparseable JSON', new OcrError('invalid_response', 'invalid JSON')],
    ['invalid schema', { nope: true }],
    ['deterministic validation', { ...valid, amount_satang: 0 }],
  ])('falls back after primary %s', async (_label, failure) => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', failure)
    const secondary = provider('gemini', 'gemini-2.5-flash', valid)
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary, secondary], now: new Date('2026-08-28T12:00:00Z') })
    expect(result.metadata.model).toBe('gemini-2.5-flash')
    expect(result.metadata.fallbackLevel).toBe(1)
  })

  it('falls back from both Gemini models to Sonnet', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', new OcrError('provider_error', 'failed'))
    const secondary = provider('gemini', 'gemini-2.5-flash', new OcrError('provider_error', 'failed'))
    const sonnet = provider('anthropic', 'claude-sonnet-4-6', valid)
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary, secondary, sonnet], now: new Date('2026-08-28T12:00:00Z') })
    expect(result.metadata).toMatchObject({ provider: 'anthropic', fallbackLevel: 2 })
  })

  it('does not call Sonnet when it is not included', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', new OcrError('provider_error', 'failed'))
    const secondary = provider('gemini', 'gemini-2.5-flash', new OcrError('provider_error', 'failed'))
    const sonnet = provider('anthropic', 'claude-sonnet-4-6', valid)
    await expect(extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary, secondary] })).rejects.toThrow('ไม่สามารถอ่านสลิปได้ในขณะนี้')
    expect(sonnet.extract).not.toHaveBeenCalled()
  })

  it('returns a sanitized terminal error after all providers fail', async () => {
    const providers = [
      provider('gemini', 'gemini-2.5-flash-lite', new Error('GEMINI_API_KEY=secret image=base64-data')),
      provider('anthropic', 'claude-sonnet-4-6', new Error('account 123456 ref ABC')),
    ]
    await expect(extractDocument({ profile: 'thai_transfer_slip', image, providers })).rejects.toMatchObject({
      message: 'ไม่สามารถอ่านสลิปได้ในขณะนี้',
    })
  })

  it('supports Anthropic as the only configured provider', async () => {
    const sonnet = provider('anthropic', 'claude-sonnet-4-6', valid)
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [sonnet], now: new Date('2026-08-28T12:00:00Z') })
    expect(result.metadata).toMatchObject({ provider: 'anthropic', fallbackLevel: 2 })
  })

  it('normalizes Buddhist year, banks, strings, and confidence', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', {
      ...valid,
      amount_satang: 150025,
      date: '28/08/2569',
      sender_name: ' สมชาย ',
      confidence: 1.2,
    })
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary], now: new Date('2026-08-28T12:00:00Z') })
    expect(result.data).toMatchObject({ amount_satang: 150025, date: '2026-08-28', sender_name: 'สมชาย', sender_bank: 'กสิกรไทย', confidence: 1 })
  })

  it('falls back instead of rounding a non-integer satang amount', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', { ...valid, amount_satang: 150025.4 })
    const secondary = provider('gemini', 'gemini-2.5-flash', valid)
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary, secondary] })
    expect(result.metadata.fallbackLevel).toBe(1)
  })

  it('accepts optional empty fields and records warnings without fallback', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', { ...valid, ref_number: '', recipient: '' })
    const secondary = provider('gemini', 'gemini-2.5-flash', valid)
    const usageRecorder: OcrUsageRecorder = { record: vi.fn().mockResolvedValue(undefined) }
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary, secondary], usageRecorder })
    expect(result.data.ref_number).toBe('')
    expect(result.metadata.validationIssueCodes).toEqual(['reference_missing', 'recipient_missing'])
    expect(secondary.extract).not.toHaveBeenCalled()
  })

  it('uses cache without calling a provider', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', valid)
    const cachedResult = {
      data: { ...valid, sender_bank: 'กสิกรไทย', recipient_bank: 'ไทยพาณิชย์' },
      metadata: { provider: 'gemini' as const, model: 'gemini-2.5-flash-lite', inputTokens: 1, outputTokens: 1, latencyMs: 1, fallbackLevel: 0, validationIssueCodes: [], success: true, errorCategory: null },
    }
    const cache: OcrCache = { get: vi.fn().mockResolvedValue(cachedResult), save: vi.fn() }
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary], cache })
    expect(result.cached).toBe(true)
    expect(primary.extract).not.toHaveBeenCalled()
  })

  it('ignores an invalid cached result and calls a provider', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', valid)
    const cache: OcrCache = { get: vi.fn().mockResolvedValue({ data: { ...valid, amount_satang: 0 }, metadata: {} }), save: vi.fn() } as unknown as OcrCache
    const result = await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary], cache })
    expect(result.cached).toBe(false)
    expect(primary.extract).toHaveBeenCalledOnce()
  })

  it('separates cache keys by profile/schema version', () => {
    const v1 = createOcrCacheKey(jpeg, 'thai_transfer_slip', '1')
    const v2 = createOcrCacheKey(jpeg, 'thai_transfer_slip', '2')
    expect(v1).not.toBe(v2)
    expect(v1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('stores successful result and usage without sensitive OCR fields', async () => {
    const primary = provider('gemini', 'gemini-2.5-flash-lite', valid)
    const cache: OcrCache = { get: vi.fn().mockResolvedValue(null), save: vi.fn() }
    const usageRecorder: OcrUsageRecorder = { record: vi.fn().mockResolvedValue(undefined) }
    await extractDocument({ profile: 'thai_transfer_slip', image, providers: [primary], cache, usageRecorder, now: new Date('2026-08-28T12:00:00Z') })
    expect(cache.save).toHaveBeenCalledOnce()
    expect(usageRecorder.record).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gemini', success: true, profile: 'thai_transfer_slip' }))
    expect(JSON.stringify(vi.mocked(usageRecorder.record).mock.calls)).not.toContain(valid.sender_name)
    expect(JSON.stringify(vi.mocked(usageRecorder.record).mock.calls)).not.toContain(valid.ref_number)
  })
})

describe('provider configuration', () => {
  it('trims whitespace accidentally stored with provider model names', () => {
    const providers = createConfiguredProviders({
      GEMINI_API_KEY: 'test', ANTHROPIC_API_KEY: 'test',
      OCR_PRIMARY_MODEL: 'gemini-3.5-flash-lite\n',
      OCR_SECONDARY_MODEL: ' gemini-2.5-flash ',
      OCR_FINAL_MODEL: 'claude-sonnet-5\n',
      OCR_FINAL_FALLBACK_ENABLED: ' true\n',
    })
    expect(providers.map(item => item.model)).toEqual([
      'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'claude-sonnet-5',
    ])
  })

  it('uses Anthropic directly when no Gemini key is configured', () => {
    const providers = createConfiguredProviders({ ANTHROPIC_API_KEY: 'test', OCR_FINAL_FALLBACK_ENABLED: 'true' })
    expect(providers.map(item => [item.name, item.model])).toEqual([['anthropic', 'claude-sonnet-5']])
  })

  it('omits Sonnet when final fallback is disabled', () => {
    const providers = createConfiguredProviders({
      GEMINI_API_KEY: 'test', ANTHROPIC_API_KEY: 'test', OCR_FINAL_FALLBACK_ENABLED: 'false',
    })
    expect(providers.map(item => item.model)).toEqual(['gemini-3.5-flash-lite', 'gemini-2.5-flash'])
  })

  it('fails safely when no provider key is configured', async () => {
    expect(createConfiguredProviders({})).toEqual([])
    await expect(extractDocument({ profile: 'thai_transfer_slip', image, providers: [] })).rejects.toMatchObject({ category: 'configuration' })
  })
})

describe('provider error categorization', () => {
  it('uses exact timeout classes and causes rather than message matching', () => {
    expect(providerErrorCategory(Object.assign(new Error('request failed'), { name: 'APIConnectionTimeoutError' }))).toBe('timeout')
    expect(providerErrorCategory(new Error('string says timeout but class does not'))).toBe('provider_error')
    expect(providerErrorCategory({ cause: Object.assign(new Error(), { name: 'AbortError' }) })).toBe('timeout')
  })
})

describe('OCR session', () => {
  it('accepts a server-signed actor and rejects tampering or expiry', () => {
    const secret = 'test-secret'
    const token = createOcrSessionToken({ actorId: 'staff', role: 'cashier', expiresAt: Date.now() + 60_000 }, secret)
    expect(verifyOcrSessionToken(token, secret)).toEqual({ actorId: 'staff', role: 'cashier' })
    expect(verifyOcrSessionToken(`${token}x`, secret)).toBeNull()
    const expired = createOcrSessionToken({ actorId: 'staff', role: 'cashier', expiresAt: Date.now() - 1 }, secret)
    expect(verifyOcrSessionToken(expired, secret)).toBeNull()
  })
})

describe('validateImage', () => {
  it('rejects unsupported file signatures', () => {
    expect(() => validateImage({ bytes: new Uint8Array([1, 2, 3]), declaredMimeType: 'application/pdf' })).toThrow('รองรับเฉพาะ')
  })

  it('rejects a client MIME that differs from magic bytes', () => {
    expect(() => validateImage({ bytes: jpeg, declaredMimeType: 'image/png' })).toThrow('ไม่ตรง')
  })

  it('rejects oversized files before encoding', () => {
    expect(() => validateImage({ bytes: jpeg, declaredMimeType: 'image/jpeg', maxBytes: 3 })).toThrow('ใหญ่เกิน')
  })
})

it('keeps the /api/ocr success response contract unchanged', () => {
  const response = toLegacyOcrResponse({ ...valid, sender_bank: 'กสิกรไทย', recipient_bank: 'ไทยพาณิชย์' }, {
    cached: false,
    hash: 'abc',
    slip_image_url: null,
  })
  expect(Object.keys(response).sort()).toEqual([
    'amount_satang', 'cached', 'confidence', 'date', 'hash', 'recipient', 'recipient_bank',
    'ref_number', 'sender_account', 'sender_bank', 'sender_name', 'slip_image_url', 'time',
  ])
})
