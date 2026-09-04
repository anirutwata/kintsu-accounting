import { describe, expect, it } from 'vitest'
import { createOcrSessionToken, verifyOcrSessionToken } from './session'
import { toLegacyOcrResponse } from './routeResponse'
import type { SlipOcrData } from '@anirutwata/ocr-kit'

// Tests for the two pieces that stay local to this app (not part of @anirutwata/ocr-kit):
// signed OCR sessions and this app's legacy /api/ocr response shape.

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

it('keeps the /api/ocr success response contract unchanged', () => {
  const valid: SlipOcrData = {
    amount_satang: 150000, date: '2026-08-28', time: '14:30', ref_number: 'TX-123',
    sender_name: 'สมชาย', sender_bank: 'กสิกรไทย', sender_account: 'xxx-x-12345-x',
    recipient: 'บริษัท คิวโซลา จำกัด', recipient_bank: 'ไทยพาณิชย์', recipient_account: 'xxx-x-98765-x',
    confidence: 0.94,
  }
  const response = toLegacyOcrResponse(valid, { cached: false, hash: 'abc', slip_image_url: null })
  expect(Object.keys(response).sort()).toEqual([
    'amount_satang', 'cached', 'confidence', 'date', 'hash', 'recipient', 'recipient_account', 'recipient_bank',
    'ref_number', 'sender_account', 'sender_bank', 'sender_name', 'slip_image_url', 'time',
  ])
})
