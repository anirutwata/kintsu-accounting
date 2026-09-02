import { createHash } from 'node:crypto'
import { createAdminClient } from '../supabase/admin'
import { configuredMaxImageBytes, validateImage } from './image'
import { createOcrCacheKey } from './cache'
import { extractDocument } from './index'
import { OcrError, type OcrAttemptMetadata, type OcrDataByProfile, type OcrProfileName } from './types'

type Context = { categoryNames?: string[] }

function quota(name: 'OCR_ACTOR_RATE_LIMIT' | 'OCR_GLOBAL_RATE_LIMIT', fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function expenseBillSchemaVersion(categoryNames: string[], base = process.env.OCR_SCHEMA_VERSION || '1'): string {
  const categoryHash = createHash('sha256').update([...categoryNames].sort().join('\0')).digest('hex').slice(0, 12)
  return `${base}-expense-date-v2-${categoryHash}`
}

async function imageFromReceiptUrl(urlValue: string) {
  let url: URL
  try { url = new URL(urlValue) } catch { throw new OcrError('validation_failure', 'URL รูปภาพไม่ถูกต้อง') }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || url.protocol !== 'https:' || url.hostname !== new URL(supabaseUrl).hostname) {
    throw new OcrError('validation_failure', 'อนุญาตเฉพาะรูปที่อัปโหลดผ่าน KINTSU')
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new OcrError('provider_error', 'ไม่สามารถอ่านไฟล์รูปภาพได้')
  const bytes = new Uint8Array(await response.arrayBuffer())
  return validateImage({
    bytes,
    declaredMimeType: (response.headers.get('content-type') || '').split(';')[0],
    maxBytes: configuredMaxImageBytes(process.env.OCR_MAX_IMAGE_BYTES),
  })
}

export async function extractUrlDocument<TProfile extends OcrProfileName>(input: {
  profile: TProfile
  url: string
  actorKey: string
  context?: Context
  schemaVersion?: string
}): Promise<{ data: OcrDataByProfile[TProfile]; cached: boolean }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new OcrError('configuration', 'OCR provider is not configured')
  const image = await imageFromReceiptUrl(input.url)
  const schemaVersion = input.schemaVersion ?? process.env.OCR_SCHEMA_VERSION ?? '1'
  const cacheKey = createOcrCacheKey(image.bytes, input.profile, schemaVersion)
  const imageHash = createHash('md5').update(image.bytes).digest('hex')
  const actorHash = createHash('sha256').update(input.actorKey).digest('hex')
  const db = createAdminClient()
  const { data: claimValue, error: claimError } = await db.rpc('claim_ocr_job', {
    p_cache_key: cacheKey, p_image_hash: imageHash, p_profile: input.profile,
    p_schema_version: schemaVersion, p_actor_hash: actorHash,
    p_actor_limit: quota('OCR_ACTOR_RATE_LIMIT', 10), p_global_limit: quota('OCR_GLOBAL_RATE_LIMIT', 50),
  })
  if (claimError || !claimValue || typeof claimValue !== 'object') throw new OcrError('configuration', 'ไม่สามารถยืนยันโควตา OCR ได้')
  const claim = claimValue as { state?: string; job_id?: string }
  if (claim.state === 'rate_limited') throw new OcrError('validation_failure', 'ส่งคำขอ OCR บ่อยเกินไป กรุณารอสักครู่')
  if (claim.state === 'in_progress') throw new OcrError('provider_error', 'ระบบกำลังอ่านรูปนี้ กรุณาลองอีกครั้ง')

  if (claim.state === 'cached') {
    const { data: row } = await db.from('ocr_jobs').select('ocr_data,provider,model,input_tokens,output_tokens,latency_ms,fallback_level,validation_issue_codes')
      .eq('cache_key', cacheKey).eq('status', 'done').maybeSingle()
    if (!row?.ocr_data) throw new OcrError('provider_error', 'OCR cache ไม่สมบูรณ์ กรุณาลองอีกครั้ง')
    const cache = { get: async () => ({ data: row.ocr_data, metadata: {
      provider: row.provider, model: row.model, inputTokens: row.input_tokens, outputTokens: row.output_tokens,
      latencyMs: row.latency_ms, fallbackLevel: row.fallback_level,
      validationIssueCodes: row.validation_issue_codes ?? [], success: true, errorCategory: null,
    } }), save: async () => undefined }
    const result = await extractDocument({ profile: input.profile, image, context: input.context, schemaVersion, providers: [], cache } as Parameters<typeof extractDocument<TProfile>>[0])
    return { data: result.data, cached: true }
  }
  if (claim.state !== 'claimed' || !claim.job_id) throw new OcrError('configuration', 'ไม่สามารถเริ่ม OCR ได้')
  const jobId = claim.job_id
  const usageRecorder = { record: async (attempt: OcrAttemptMetadata & { profile: OcrProfileName; schemaVersion: string }) => {
    await db.from('ocr_usage_events').insert({
      ocr_job_id: jobId, provider: attempt.provider, model: attempt.model,
      input_tokens: attempt.inputTokens, output_tokens: attempt.outputTokens, latency_ms: attempt.latencyMs,
      fallback_level: attempt.fallbackLevel, validation_issue_codes: attempt.validationIssueCodes,
      success: attempt.success, error_category: attempt.errorCategory, profile: attempt.profile, schema_version: attempt.schemaVersion,
    })
  } }
  try {
    const result = await extractDocument({ profile: input.profile, image, context: input.context, schemaVersion, usageRecorder } as Parameters<typeof extractDocument<TProfile>>[0])
    await db.from('ocr_jobs').update({
      image_path: new URL(input.url).pathname, status: 'done', ocr_data: result.data,
      provider: result.metadata.provider, model: result.metadata.model,
      input_tokens: result.metadata.inputTokens, output_tokens: result.metadata.outputTokens,
      latency_ms: result.metadata.latencyMs, fallback_level: result.metadata.fallbackLevel,
      validation_issue_codes: result.metadata.validationIssueCodes, completed_at: new Date().toISOString(),
    }).eq('id', jobId)
    return { data: result.data, cached: false }
  } catch (error) {
    const failure = error instanceof OcrError ? error : new OcrError('provider_error', 'OCR ล้มเหลว')
    await db.from('ocr_jobs').update({ status: 'failed', error_message: failure.category, validation_issue_codes: failure.issueCodes, completed_at: new Date().toISOString() }).eq('id', jobId)
    throw failure
  }
}
