import { createHash } from 'node:crypto'
import type { OcrProfileName } from './types'

export function createOcrCacheKey(bytes: Uint8Array, profile: OcrProfileName, schemaVersion: string): string {
  return createHash('sha256')
    .update(bytes)
    .update('\0')
    .update(profile)
    .update('\0')
    .update(schemaVersion)
    .digest('hex')
}
