import { OcrError, type SupportedImageMimeType } from './types'

const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024

export function detectImageMime(bytes: Uint8Array): SupportedImageMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

export function validateImage(input: { bytes: Uint8Array; declaredMimeType: string; maxBytes?: number }) {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES
  if (input.bytes.length === 0) throw new OcrError('validation_failure', 'ไฟล์รูปภาพว่างเปล่า', ['image_empty'])
  if (input.bytes.length > maxBytes) throw new OcrError('validation_failure', 'ไฟล์รูปภาพมีขนาดใหญ่เกินกำหนด', ['image_too_large'])
  const detected = detectImageMime(input.bytes)
  if (!detected) throw new OcrError('validation_failure', 'รองรับเฉพาะ JPEG, PNG และ WebP', ['image_type_unsupported'])
  if (input.declaredMimeType && input.declaredMimeType !== detected) {
    throw new OcrError('validation_failure', 'ชนิดไฟล์ไม่ตรงกับเนื้อหาไฟล์', ['image_mime_mismatch'])
  }
  return { bytes: input.bytes, mimeType: detected }
}

export function configuredMaxImageBytes(value: string | undefined): number {
  if (!value) return DEFAULT_MAX_IMAGE_BYTES
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new OcrError('configuration', 'OCR_MAX_IMAGE_BYTES is invalid')
  }
  return parsed
}
