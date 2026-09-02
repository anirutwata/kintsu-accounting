import { createOcrCacheKey } from './cache'
import { thaiTransferSlipProfile } from './profiles/slip'
import { taxInvoiceBillProfile } from './profiles/taxInvoiceBill'
import { expenseBillProfile } from './profiles/expenseBill'
import { AnthropicOcrProvider } from './providers/anthropic'
import { GeminiOcrProvider } from './providers/gemini'
import { hasBlockingSlipIssues, normalizeAndValidateSlip } from './validation'
import { attemptMetadata } from './usage'
import {
  OcrError,
  type OcrCache,
  type OcrImage,
  type OcrProfileName,
  type OcrProvider,
  type OcrResult,
  type OcrDataByProfile,
  type OcrUsageRecorder,
} from './types'

export interface ExtractDocumentInput {
  profile: OcrProfileName
  image: OcrImage
  providers?: OcrProvider[]
  cache?: OcrCache
  usageRecorder?: OcrUsageRecorder
  schemaVersion?: string
  timeoutMs?: number
  now?: Date
  context?: { categoryNames?: string[] }
}

type OcrEnvironment = Partial<Record<
  'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY' | 'OCR_PRIMARY_MODEL' | 'OCR_SECONDARY_MODEL' |
  'OCR_FINAL_MODEL' | 'OCR_FINAL_FALLBACK_ENABLED', string
>>

export function createConfiguredProviders(environment?: OcrEnvironment): OcrProvider[] {
  const env: OcrEnvironment = environment ?? {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OCR_PRIMARY_MODEL: process.env.OCR_PRIMARY_MODEL,
    OCR_SECONDARY_MODEL: process.env.OCR_SECONDARY_MODEL,
    OCR_FINAL_MODEL: process.env.OCR_FINAL_MODEL,
    OCR_FINAL_FALLBACK_ENABLED: process.env.OCR_FINAL_FALLBACK_ENABLED,
  }
  const providers: OcrProvider[] = []
  const geminiKey = env.GEMINI_API_KEY
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('OCR_') && value !== undefined && !value.trim()) {
      throw new OcrError('configuration', `${name} must not be blank`)
    }
    if (name.endsWith('_MODEL') && value && !/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
      throw new OcrError('configuration', `${name} is invalid`)
    }
  }
  if (geminiKey) {
    providers.push(new GeminiOcrProvider(env.OCR_PRIMARY_MODEL || 'gemini-3.5-flash-lite', 0, geminiKey))
    providers.push(new GeminiOcrProvider(env.OCR_SECONDARY_MODEL || 'gemini-2.5-flash', 1, geminiKey))
  }
  if (env.OCR_FINAL_FALLBACK_ENABLED !== 'false' && env.ANTHROPIC_API_KEY) {
    providers.push(new AnthropicOcrProvider(env.OCR_FINAL_MODEL || 'claude-sonnet-5', env.ANTHROPIC_API_KEY))
  }
  return providers
}

function configuredTimeout(value: number | undefined): number {
  if (value) return value
  if (process.env.OCR_PROVIDER_TIMEOUT_MS === undefined) return 20_000
  const parsed = Number(process.env.OCR_PROVIDER_TIMEOUT_MS)
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 120_000) {
    throw new OcrError('configuration', 'OCR_PROVIDER_TIMEOUT_MS is invalid')
  }
  return parsed
}

async function recordUsage(recorder: OcrUsageRecorder | undefined, attempt: Parameters<OcrUsageRecorder['record']>[0]) {
  if (!recorder) return
  try { await recorder.record(attempt) } catch { /* telemetry is best-effort */ }
}

async function saveCache(cache: OcrCache | undefined, cacheKey: string, result: Parameters<OcrCache['save']>[1]) {
  if (!cache) return
  try { await cache.save(cacheKey, result) } catch { /* cache is best-effort */ }
}

const profiles = {
  thai_transfer_slip: {
    ...thaiTransferSlipProfile,
    validate: normalizeAndValidateSlip,
    isBlocking: hasBlockingSlipIssues,
    failureMessage: 'ไม่สามารถอ่านสลิปได้ในขณะนี้',
    maxOutputTokens: 512,
    promptFor: () => thaiTransferSlipProfile.prompt,
    validateFor: (raw: unknown, _context: ExtractDocumentInput['context'], now?: Date) => normalizeAndValidateSlip(raw, now),
  },
  tax_invoice_bill: {
    ...taxInvoiceBillProfile, maxOutputTokens: 2048,
    promptFor: () => taxInvoiceBillProfile.prompt,
    validateFor: (raw: unknown) => taxInvoiceBillProfile.validate(raw),
  },
  expense_bill: {
    ...expenseBillProfile,
    promptFor: (context?: ExtractDocumentInput['context']) => expenseBillProfile.prompt(context?.categoryNames ?? []),
    validateFor: (raw: unknown, context?: ExtractDocumentInput['context']) => expenseBillProfile.validate(raw, context?.categoryNames ?? []),
  },
} as const

export async function extractDocument<TProfile extends keyof OcrDataByProfile>(
  input: ExtractDocumentInput & { profile: TProfile },
): Promise<OcrResult<OcrDataByProfile[TProfile]>> {
  const profile = profiles[input.profile as keyof typeof profiles]
  if (!profile) throw new OcrError('configuration', 'Unsupported OCR profile')
  const schemaVersion = input.schemaVersion ?? process.env.OCR_SCHEMA_VERSION ?? '1'
  if (!schemaVersion.trim()) throw new OcrError('configuration', 'OCR_SCHEMA_VERSION must not be blank')
  const hash = createOcrCacheKey(input.image.bytes, input.profile, schemaVersion)

  try {
    const cached = await input.cache?.get(hash)
    if (cached) {
      const validation = profile.validateFor(cached.data, input.context, input.now)
      if (validation.data && !profile.isBlocking(validation.issueCodes)) {
        return { ...cached, data: validation.data, cached: true, hash } as OcrResult<OcrDataByProfile[TProfile]>
      }
    }
  } catch { /* cache failure must not prevent OCR */ }

  const providers = input.providers ?? createConfiguredProviders()
  if (providers.length === 0) throw new OcrError('configuration', 'OCR provider is not configured')

  const failures: string[] = []
  for (const provider of providers) {
    const fallbackLevel = provider.fallbackLevel
    const attemptStartedAt = Date.now()
    try {
      const providerResult = await provider.extract({
        image: input.image,
        prompt: profile.promptFor(input.context),
        jsonSchema: profile.jsonSchema,
        timeoutMs: configuredTimeout(input.timeoutMs),
        maxOutputTokens: profile.maxOutputTokens,
      })
      const validation = profile.validateFor(providerResult.data, input.context, input.now)
      if (!validation.data || profile.isBlocking(validation.issueCodes)) {
        const metadata = attemptMetadata({
          provider, fallbackLevel, latencyMs: providerResult.latencyMs,
          inputTokens: providerResult.usage.inputTokens, outputTokens: providerResult.usage.outputTokens,
          issueCodes: validation.issueCodes, success: false, errorCategory: 'validation_failure',
        })
        await recordUsage(input.usageRecorder, { ...metadata, profile: input.profile, schemaVersion })
        failures.push('validation_failure')
        continue
      }
      const metadata = attemptMetadata({
        provider, fallbackLevel, latencyMs: providerResult.latencyMs,
        inputTokens: providerResult.usage.inputTokens, outputTokens: providerResult.usage.outputTokens,
        issueCodes: validation.issueCodes, success: true,
      })
      await recordUsage(input.usageRecorder, { ...metadata, profile: input.profile, schemaVersion })
      const result = { data: validation.data, metadata }
      await saveCache(input.cache, hash, result)
      return { ...result, cached: false, hash } as OcrResult<OcrDataByProfile[TProfile]>
    } catch (error) {
      const ocrError = error instanceof OcrError ? error : new OcrError('provider_error', 'OCR provider failed')
      const metadata = attemptMetadata({
        provider, fallbackLevel, latencyMs: Date.now() - attemptStartedAt,
        success: false, errorCategory: ocrError.category, issueCodes: ocrError.issueCodes,
      })
      await recordUsage(input.usageRecorder, { ...metadata, profile: input.profile, schemaVersion })
      failures.push(ocrError.category)
    }
  }
  throw new OcrError('provider_error', profile.failureMessage, [...new Set(failures)])
}

export { parseTaxInvoiceBillJson } from './profiles/taxInvoiceBill'

export * from './types'
export * from './image'
export * from './cache'
export * from './validation'
