import type { OcrAttemptMetadata, OcrErrorCategory, OcrProvider } from './types'

export function attemptMetadata(input: {
  provider: OcrProvider
  fallbackLevel: number
  latencyMs?: number
  inputTokens?: number | null
  outputTokens?: number | null
  issueCodes?: string[]
  success: boolean
  errorCategory?: OcrErrorCategory | null
}): OcrAttemptMetadata {
  return {
    provider: input.provider.name,
    model: input.provider.model,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    latencyMs: input.latencyMs ?? 0,
    fallbackLevel: input.fallbackLevel,
    validationIssueCodes: input.issueCodes ?? [],
    success: input.success,
    errorCategory: input.errorCategory ?? null,
  }
}
