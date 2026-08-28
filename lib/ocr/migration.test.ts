import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../supabase/migrations/053_ocr_provider_layer.sql', import.meta.url), 'utf8')

describe('OCR migration safety contract', () => {
  it('serializes duplicate cache claims and actor rate checks', () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('ocr-cache:' || p_cache_key, 0))")
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('ocr:' || p_actor_hash, 0))")
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('ocr:global', 0))")
    expect(sql).toContain("status in ('processing', 'done')")
  })

  it('recovers only claims older than the bounded provider chain', () => {
    expect(sql).toContain("created_at < now() - interval '10 minutes'")
  })

  it('allows attempts one through ten and blocks attempt eleven atomically', () => {
    expect(sql).toContain('p_actor_limit integer default 10')
    expect(sql).toContain('p_global_limit integer default 50')
    expect(sql.indexOf("pg_advisory_xact_lock(hashtextextended('ocr:' || p_actor_hash, 0))"))
      .toBeLessThan(sql.indexOf('select count(*) into v_recent_count'))
  })

  it('locks down definer search path, RPC, jobs, and telemetry to service role', () => {
    expect(sql).toContain("security definer set search_path=''")
    expect(sql).toContain('revoke all on function claim_ocr_job(text,text,text,text,text,integer,integer) from public,anon,authenticated')
    expect(sql).toContain('alter table public.ocr_jobs enable row level security')
    expect(sql).toContain('revoke all on table public.ocr_jobs from public,anon,authenticated')
    expect(sql).toContain('alter table ocr_usage_events enable row level security')
    expect(sql).toContain('grant select,insert on table ocr_usage_events to service_role')
  })
})
