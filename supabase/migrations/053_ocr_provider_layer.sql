-- Add versioned OCR cache identity and privacy-safe provider usage metadata.
-- Existing image_hash/ocr_data rows remain readable for backward compatibility.

alter table ocr_jobs
  add column if not exists cache_key text,
  add column if not exists profile text,
  add column if not exists schema_version text,
  add column if not exists request_actor_hash text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists latency_ms integer,
  add column if not exists fallback_level integer,
  add column if not exists validation_issue_codes text[] not null default '{}';

create unique index if not exists ocr_jobs_active_cache_key_idx
  on ocr_jobs(cache_key)
  where cache_key is not null and status in ('processing', 'done');

create index if not exists ocr_jobs_actor_created_at_idx
  on ocr_jobs(request_actor_hash, created_at desc)
  where request_actor_hash is not null;

alter table public.ocr_jobs enable row level security;
revoke all on table public.ocr_jobs from public,anon,authenticated;
grant select,insert,update on table public.ocr_jobs to service_role;

create or replace function claim_ocr_job(
  p_cache_key text,
  p_image_hash text,
  p_profile text,
  p_schema_version text,
  p_actor_hash text,
  p_actor_limit integer default 10,
  p_global_limit integer default 50
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_job public.ocr_jobs%rowtype;
  v_recent_count integer;
  v_global_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ocr-cache:' || p_cache_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('ocr:' || p_actor_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('ocr:global', 0));

  update public.ocr_jobs
    set status='failed', error_message='stale_claim', completed_at=now()
    where cache_key=p_cache_key and status='processing'
      and created_at < now() - interval '10 minutes';

  select * into v_job from public.ocr_jobs
    where cache_key=p_cache_key and status in ('processing','done')
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object(
      'state', case when v_job.status='done' then 'cached' else 'in_progress' end,
      'job_id', v_job.id
    );
  end if;

  select count(*) into v_recent_count from public.ocr_jobs
    where request_actor_hash=p_actor_hash and created_at >= now() - interval '1 minute';
  if v_recent_count >= greatest(1, p_actor_limit) then
    return jsonb_build_object('state','rate_limited');
  end if;

  select count(*) into v_global_count from public.ocr_jobs
    where created_at >= now() - interval '1 minute';
  if v_global_count >= greatest(1, p_global_limit) then
    return jsonb_build_object('state','rate_limited');
  end if;

  insert into public.ocr_jobs(
    image_path,image_hash,cache_key,profile,schema_version,request_actor_hash,status
  ) values (
    'pending/' || p_cache_key,p_image_hash,p_cache_key,p_profile,p_schema_version,p_actor_hash,'processing'
  ) returning * into v_job;
  return jsonb_build_object('state','claimed','job_id',v_job.id);
end; $$;

revoke all on function claim_ocr_job(text,text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function claim_ocr_job(text,text,text,text,text,integer,integer) to service_role;

create table if not exists ocr_usage_events (
  id uuid primary key default gen_random_uuid(),
  ocr_job_id uuid references ocr_jobs(id),
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer not null,
  fallback_level integer not null,
  validation_issue_codes text[] not null default '{}',
  success boolean not null,
  error_category text,
  profile text not null,
  schema_version text not null,
  created_at timestamptz not null default now()
);

alter table ocr_usage_events enable row level security;
revoke all on table ocr_usage_events from public,anon,authenticated;
grant select,insert on table ocr_usage_events to service_role;

create index if not exists ocr_usage_events_created_at_idx
  on ocr_usage_events(created_at desc);
