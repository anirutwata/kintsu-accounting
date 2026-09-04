import type { SlipOcrData } from '@anirutwata/ocr-kit'

export interface LegacyOcrResponse extends SlipOcrData {
  cached: boolean
  hash: string
  slip_image_url: string | null
}
export function toLegacyOcrResponse(
  data: SlipOcrData,
  extras: Pick<LegacyOcrResponse, 'cached' | 'hash' | 'slip_image_url'>,
): LegacyOcrResponse {
  return {
    amount_satang: data.amount_satang,
    date: data.date,
    time: data.time,
    ref_number: data.ref_number,
    sender_name: data.sender_name,
    sender_bank: data.sender_bank,
    sender_account: data.sender_account,
    recipient: data.recipient,
    recipient_bank: data.recipient_bank,
    recipient_account: data.recipient_account,
    confidence: data.confidence,
    cached: extras.cached,
    hash: extras.hash,
    slip_image_url: extras.slip_image_url,
  }
}
