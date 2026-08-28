import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  configuredMaxImageBytes,
  createOcrCacheKey,
  extractDocument,
  OcrError,
  validateImage,
  type OcrAttemptMetadata,
} from '@/lib/ocr'
import { toLegacyOcrResponse } from '@/lib/ocr/routeResponse'
import { hasBlockingSlipIssues, normalizeAndValidateSlip } from '@/lib/ocr/validation'
import { verifyOcrSessionToken } from '@/lib/ocr/session'

const PROFILE = 'thai_transfer_slip' as const

function actorHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex')
}
function quota(name: 'OCR_ACTOR_RATE_LIMIT' | 'OCR_GLOBAL_RATE_LIMIT', fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
function sanitizedFailure(error: unknown) {
  if (error instanceof OcrError) {
    const status = error.category === 'validation_failure' ? 400 : error.category === 'configuration' ? 503 : 502
    return { status, message: error.message, category: error.category, issues: error.issueCodes }
  }
  return { status: 500, message: 'OCR ล้มเหลว', category: 'provider_error', issues: [] as string[] }
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'OCR provider is not configured' }, { status: 503 })
  const session = verifyOcrSessionToken(cookieStore.get('kintsu_acc_ocr_session')?.value, serviceRoleKey)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'ข้อมูลอัปโหลดไม่ถูกต้อง' }, { status: 400 })
  }
  const value = formData.get('file')
  if (!(value instanceof File)) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  let maxImageBytes: number
  try { maxImageBytes = configuredMaxImageBytes(process.env.OCR_MAX_IMAGE_BYTES) } catch (error) {
    const failure = sanitizedFailure(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
  if (value.size > maxImageBytes) {
    return NextResponse.json({ error: 'ไฟล์รูปภาพมีขนาดใหญ่เกินกำหนด', code: 'image_too_large' }, { status: 400 })
  }

  const rawBytes = new Uint8Array(await value.arrayBuffer())
  let image: ReturnType<typeof validateImage>
  try {
    image = validateImage({
      bytes: rawBytes,
      declaredMimeType: value.type,
      maxBytes: maxImageBytes,
    })
  } catch (error) {
    const failure = sanitizedFailure(error)
    return NextResponse.json({ error: failure.message, code: failure.issues[0] }, { status: failure.status })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'OCR provider is not configured' }, { status: 503 })
  }
  const db = createAdminClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const schemaVersion = process.env.OCR_SCHEMA_VERSION || '1'
  const hash = createOcrCacheKey(image.bytes, PROFILE, schemaVersion)
  const legacyHash = createHash('md5').update(image.bytes).digest('hex')
  const requestActorHash = actorHash(session.role === 'owner' ? `owner:${session.actorId}` : 'staff')

  const { data: cached } = await db
    .from('ocr_jobs')
    .select('ocr_data')
    .eq('cache_key', hash)
    .eq('status', 'done')
    .maybeSingle()
  const { data: legacyCached } = cached || schemaVersion !== '1' ? { data: null } : await db
    .from('ocr_jobs')
    .select('ocr_data')
    .eq('image_hash', legacyHash)
    .eq('status', 'done')
    .maybeSingle()
  const cachedValue = (cached?.ocr_data || legacyCached?.ocr_data) as unknown
  const validatedCache = normalizeAndValidateSlip(cachedValue)
  if (validatedCache.data && !hasBlockingSlipIssues(validatedCache.issueCodes)) {
    const cachedImageUrl = cachedValue && typeof cachedValue === 'object' && 'slip_image_url' in cachedValue
      && (typeof cachedValue.slip_image_url === 'string' || cachedValue.slip_image_url === null)
      ? cachedValue.slip_image_url : null
    return NextResponse.json(toLegacyOcrResponse(validatedCache.data, {
      cached: true,
      hash: legacyHash,
      slip_image_url: cachedImageUrl,
    }))
  }

  const { data: claimValue, error: claimError } = await db.rpc('claim_ocr_job', {
    p_cache_key: hash,
    p_image_hash: legacyHash,
    p_profile: PROFILE,
    p_schema_version: schemaVersion,
    p_actor_hash: requestActorHash,
    p_actor_limit: quota('OCR_ACTOR_RATE_LIMIT', 10),
    p_global_limit: quota('OCR_GLOBAL_RATE_LIMIT', 50),
  })
  if (claimError || !claimValue || typeof claimValue !== 'object') {
    return NextResponse.json({ error: 'ไม่สามารถยืนยันโควตา OCR ได้' }, { status: 503 })
  }
  const claim = claimValue as { state?: string; job_id?: string }
  if (claim.state === 'rate_limited') {
    return NextResponse.json({ error: 'ส่งคำขอ OCR บ่อยเกินไป กรุณารอสักครู่' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  if (claim.state === 'cached') {
    const { data: concurrent } = await db
      .from('ocr_jobs')
      .select('ocr_data,status')
      .eq('cache_key', hash)
      .maybeSingle()
    if (concurrent?.status === 'done' && concurrent.ocr_data) {
      const validation = normalizeAndValidateSlip(concurrent.ocr_data)
      if (validation.data && !hasBlockingSlipIssues(validation.issueCodes)) {
        const imageUrl = typeof concurrent.ocr_data === 'object' && concurrent.ocr_data !== null
          && 'slip_image_url' in concurrent.ocr_data && typeof concurrent.ocr_data.slip_image_url === 'string'
          ? concurrent.ocr_data.slip_image_url : null
        return NextResponse.json(toLegacyOcrResponse(validation.data, { cached: true, hash: legacyHash, slip_image_url: imageUrl }))
      }
    }
    return NextResponse.json({ error: 'OCR cache ไม่สมบูรณ์ กรุณาลองอีกครั้ง' }, { status: 503 })
  }
  if (claim.state === 'in_progress') {
    return NextResponse.json({ error: 'ระบบกำลังอ่านสลิปนี้ กรุณาลองอีกครั้ง' }, { status: 409 })
  }
  if (claim.state !== 'claimed' || !claim.job_id) {
    return NextResponse.json({ error: 'ไม่สามารถเริ่ม OCR ได้' }, { status: 503 })
  }
  const jobId = claim.job_id

  const usageRecorder = {
    record: async (attempt: OcrAttemptMetadata & { profile: typeof PROFILE; schemaVersion: string }) => {
      await db.from('ocr_usage_events').insert({
        ocr_job_id: jobId,
        provider: attempt.provider,
        model: attempt.model,
        input_tokens: attempt.inputTokens,
        output_tokens: attempt.outputTokens,
        latency_ms: attempt.latencyMs,
        fallback_level: attempt.fallbackLevel,
        validation_issue_codes: attempt.validationIssueCodes,
        success: attempt.success,
        error_category: attempt.errorCategory,
        profile: attempt.profile,
        schema_version: attempt.schemaVersion,
      })
    },
  }

  try {
    const result = await extractDocument({ profile: PROFILE, image, schemaVersion, usageRecorder })
    const extension = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg'
    const fileName = `slips/${Date.now()}_${hash.slice(0, 12)}.${extension}`
    let uploadData: { path: string } | null = null
    try {
      const upload = await db.storage
        .from('slips')
        .upload(fileName, Buffer.from(image.bytes), { contentType: image.mimeType, upsert: false })
      uploadData = upload.data
    } catch { /* storage failure must not discard a valid OCR result */ }
    const slipImageUrl = uploadData
      ? db.storage.from('slips').getPublicUrl(fileName).data.publicUrl
      : null
    const response = toLegacyOcrResponse(result.data, { cached: false, hash: legacyHash, slip_image_url: slipImageUrl })

    if (jobId) {
      await db.from('ocr_jobs').update({
        image_path: uploadData ? fileName : `upload-failed/${hash}`,
        status: 'done',
        ocr_data: response,
        provider: result.metadata.provider,
        model: result.metadata.model,
        input_tokens: result.metadata.inputTokens,
        output_tokens: result.metadata.outputTokens,
        latency_ms: result.metadata.latencyMs,
        fallback_level: result.metadata.fallbackLevel,
        validation_issue_codes: result.metadata.validationIssueCodes,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId)
    }

    return NextResponse.json(response)
  } catch (error) {
    const failure = sanitizedFailure(error)
    if (jobId) {
      await db.from('ocr_jobs').update({
        status: 'failed',
        error_message: failure.category,
        validation_issue_codes: failure.issues,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId)
    }
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
}
