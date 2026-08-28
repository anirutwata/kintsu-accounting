import type { OcrErrorCategory } from '../types'

const TIMEOUT_ERROR_NAMES = new Set([
  'AbortError', 'TimeoutError', 'RequestTimeoutError', 'APIConnectionTimeoutError', 'APIUserAbortError',
])

export function providerErrorCategory(error: unknown): OcrErrorCategory {
  let current: unknown = error
  const visited = new Set<unknown>()
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current)
    const record = current as { name?: unknown; cause?: unknown }
    if (typeof record.name === 'string' && TIMEOUT_ERROR_NAMES.has(record.name)) return 'timeout'
    current = record.cause
  }
  return 'provider_error'
}
