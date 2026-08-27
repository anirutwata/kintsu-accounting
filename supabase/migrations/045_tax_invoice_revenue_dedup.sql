-- Prevent customer tax invoices from duplicating daily cash, TTB transfer, or
-- LINE Pay EDC revenue. Existing issued invoices are audit-only until a
-- deliberate historical reconciliation is run; this migration never mutates
-- FlowAccount documents.

alter table tax_invoice_requests
  add column if not exists dedup_action text,
  add column if not exists dedup_state text not null default 'unreserved',
  add column if not exists dedup_authoritative_satang bigint,
  add column if not exists dedup_remaining_satang bigint,
  add column if not exists dedup_original_record_id integer,
  add column if not exists dedup_original_document_serial text,
  add column if not exists dedup_correction_record_id integer,
  add column if not exists dedup_correction_document_serial text,
  add column if not exists dedup_state_changed_at timestamptz,
  add column if not exists dedup_error text,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table linepay_edc_revenue_days
  add column if not exists full_tax_invoice_satang bigint not null default 0
    check (full_tax_invoice_satang >= 0 and full_tax_invoice_satang <= gross_amount_satang);

alter table daily_sales
  add column if not exists full_tax_invoice_cash_satang bigint not null default 0
    check (full_tax_invoice_cash_satang >= 0);

alter table ttb_promptpay_reports
  add column if not exists full_tax_invoice_satang bigint not null default 0
    check (full_tax_invoice_satang >= 0 and full_tax_invoice_satang <= successful_amount_satang);

alter table tax_invoice_requests drop constraint if exists tax_invoice_requests_dedup_state_check;
alter table tax_invoice_requests add constraint tax_invoice_requests_dedup_state_check check (
  dedup_state in (
    'unreserved', 'reserved', 'invoice_created', 'accounting_complete',
    'complete', 'manual_review', 'historical_review', 'error', 'cancelled'
  )
);

alter table tax_invoice_requests drop constraint if exists tax_invoice_requests_dedup_action_check;
alter table tax_invoice_requests add constraint tax_invoice_requests_dedup_action_check check (
  dedup_action is null or dedup_action in (
    'reversal_journal', 'reduce_future_revenue_journal', 'reduce_future_edc_cash_sale',
    'replace_edc_cash_sale', 'manual_review_closed_vat_period',
    'manual_review_historical_documents', 'manual_review_source_document_state', 'historical_review'
  )
);

create unique index if not exists tax_invoice_requests_dedup_correction_record_uidx
  on tax_invoice_requests(dedup_correction_record_id)
  where dedup_correction_record_id is not null;
create index if not exists tax_invoice_requests_dedup_allocation_idx
  on tax_invoice_requests(document_date, payment_method, dedup_state);

-- Documents issued before this feature may already overlap their daily source.
-- Preserve them for an explicit audited reconciliation; never auto-void them.
update tax_invoice_requests set
  dedup_action = 'historical_review',
  dedup_state = 'historical_review',
  dedup_authoritative_satang = null,
  dedup_remaining_satang = null,
  dedup_state_changed_at = now()
where status in ('created', 'emailed')
  and flowaccount_record_id is not null
  and dedup_state = 'unreserved'
  and not is_deleted;

create or replace function reserve_tax_invoice_revenue(p_request_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request tax_invoice_requests%rowtype;
  v_authoritative bigint;
  v_allocated bigint;
  v_remaining bigint;
  v_action text;
  v_edc_record_id integer;
  v_edc_document_serial text;
  v_source_record_id integer;
  v_source_document_serial text;
  v_source_state text;
  v_source_synced_amount bigint;
  v_source_total integer;
  v_source_synced integer;
  v_source_unsynced integer;
begin
  select * into v_request from tax_invoice_requests where id = p_request_id and not is_deleted for update;
  if not found then raise exception 'ไม่พบคำขอใบกำกับภาษี'; end if;
  if v_request.dedup_state <> 'unreserved' then
    return to_jsonb(v_request);
  end if;
  if v_request.status <> 'processing' then
    raise exception 'คำขอใบกำกับภาษียังไม่ได้รับการอนุมัติหรือถูกดำเนินการแล้ว';
  end if;
  if v_request.document_date is null or v_request.payment_method not in ('cash','transfer','credit_card') then
    raise exception 'คำขอใบกำกับภาษีไม่มีวันที่หรือช่องทางชำระที่ถูกต้อง';
  end if;
  if v_request.total_satang is null or v_request.total_satang <= 0 then
    raise exception 'ยอดคำขอใบกำกับภาษีไม่ถูกต้อง';
  end if;

  -- Serialize allocation for one revenue pool even when Telegram callbacks race.
  perform pg_advisory_xact_lock(hashtextextended(v_request.document_date::text || ':' || v_request.payment_method, 0));

  if v_request.payment_method = 'cash' then
    select coalesce(cash_satang, 0) + coalesce(papaya_cash_satang, 0),
      flowaccount_cash_record_id, flowaccount_cash_document_serial, flowaccount_cash_journal_state
      , flowaccount_cash_synced_amount_satang
      into v_authoritative, v_source_record_id, v_source_document_serial, v_source_state, v_source_synced_amount
      from daily_sales where id = v_request.document_date::text;
  elsif v_request.payment_method = 'transfer' then
    select coalesce(sum(successful_amount_satang), 0), count(*),
      count(*) filter (where sync_state = 'synced' and flowaccount_record_id is not null and flowaccount_document_serial is not null),
      count(*) filter (where sync_state in ('idle','error') and flowaccount_record_id is null),
      max(flowaccount_record_id), max(flowaccount_document_serial)
      into v_authoritative, v_source_total, v_source_synced, v_source_unsynced,
        v_source_record_id, v_source_document_serial
      from ttb_promptpay_reports
      where report_date = v_request.document_date and not is_deleted;
  else
    select gross_amount_satang, cash_sale_record_id, cash_sale_document_serial
      into v_authoritative, v_edc_record_id, v_edc_document_serial
      from linepay_edc_revenue_days
      where revenue_date = v_request.document_date and not is_deleted;
  end if;

  if coalesce(v_authoritative, 0) <= 0 then
    raise exception 'ไม่พบยอด authoritative ช่องทาง % วันที่ %', v_request.payment_method, v_request.document_date;
  end if;

  select coalesce(sum(total_satang), 0) into v_allocated
    from tax_invoice_requests
    where id <> v_request.id
      and document_date = v_request.document_date
      and payment_method = v_request.payment_method
      and dedup_state in ('reserved','invoice_created','accounting_complete','complete','historical_review')
      and not is_deleted;
  v_remaining := v_authoritative - v_allocated - v_request.total_satang;
  if v_remaining < 0 then
    raise exception 'ยอดใบกำกับภาษีรวมเกินยอด authoritative วันที่ %', v_request.document_date;
  end if;

  if v_request.payment_method = 'cash' then
    if v_source_state = 'synced' and v_source_record_id is not null
      and v_source_document_serial is not null and v_source_synced_amount = v_authoritative then
      v_action := 'reversal_journal';
    elsif v_source_state in ('idle','error') and v_source_record_id is null then
      v_action := 'reduce_future_revenue_journal';
    else
      v_action := 'manual_review_source_document_state';
    end if;
  elsif v_request.payment_method = 'transfer' then
    if v_source_total = 1 and v_source_synced = 1 then
      v_action := 'reversal_journal';
    elsif v_source_total > 0 and v_source_unsynced = v_source_total then
      v_action := 'reduce_future_revenue_journal';
    else
      v_action := 'manual_review_source_document_state';
    end if;
  elsif exists (
    select 1 from tax_invoice_requests
    where id <> v_request.id and document_date = v_request.document_date
      and payment_method = 'credit_card' and dedup_state = 'historical_review' and not is_deleted
  ) then
    v_action := 'manual_review_historical_documents';
  elsif date_trunc('month', v_request.document_date)::date <> date_trunc('month', p_today)::date then
    v_action := 'manual_review_closed_vat_period';
  elsif v_edc_record_id is null then
    v_action := 'reduce_future_edc_cash_sale';
  else
    v_action := 'replace_edc_cash_sale';
  end if;

  update tax_invoice_requests set
    dedup_action = v_action,
    dedup_state = case when v_action like 'manual_review%' then 'manual_review' else 'reserved' end,
    dedup_authoritative_satang = v_authoritative,
    dedup_remaining_satang = v_remaining,
    dedup_original_record_id = case when v_request.payment_method in ('cash','transfer') then v_source_record_id else v_edc_record_id end,
    dedup_original_document_serial = case when v_request.payment_method in ('cash','transfer') then v_source_document_serial else v_edc_document_serial end,
    dedup_state_changed_at = now(),
    dedup_error = null
  where id = v_request.id
  returning * into v_request;

  return to_jsonb(v_request);
end;
$$;

revoke all on function reserve_tax_invoice_revenue(uuid,date) from public;
revoke all on function reserve_tax_invoice_revenue(uuid,date) from anon, authenticated;
grant execute on function reserve_tax_invoice_revenue(uuid,date) to service_role;

create or replace function record_tax_invoice_created(
  p_request_id uuid, p_record_id integer, p_document_serial text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request tax_invoice_requests%rowtype;
  v_to_allocate bigint;
  v_report record;
  v_report_allocation bigint;
  v_source_state text;
  v_source_record_id integer;
  v_source_document_serial text;
  v_source_total integer;
  v_source_synced integer;
begin
  select * into v_request from tax_invoice_requests
    where id = p_request_id and not is_deleted for update;
  if not found then raise exception 'ไม่พบคำขอใบกำกับภาษี'; end if;
  if v_request.flowaccount_record_id is not null then
    if v_request.flowaccount_record_id = p_record_id
      and v_request.flowaccount_document_serial = p_document_serial then
      return to_jsonb(v_request);
    end if;
    raise exception 'คำขอนี้ผูกกับใบกำกับภาษี FlowAccount ใบอื่นแล้ว';
  end if;
  if v_request.dedup_state <> 'reserved' then
    raise exception 'คำขอนี้ไม่ได้อยู่ในสถานะจองยอด';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request.document_date::text || ':' || v_request.payment_method, 0));

  -- Lock source rows before activating the allocation. A concurrent sync that
  -- won after reservation is converted to a correction/replacement action.
  if v_request.payment_method = 'cash' and v_request.dedup_action = 'reduce_future_revenue_journal' then
    select flowaccount_cash_journal_state, flowaccount_cash_record_id, flowaccount_cash_document_serial
      into v_source_state, v_source_record_id, v_source_document_serial
      from daily_sales where id = v_request.document_date::text for update;
    if v_source_state = 'synced' and v_source_record_id is not null and v_source_document_serial is not null then
      v_request.dedup_action := 'reversal_journal';
      v_request.dedup_original_record_id := v_source_record_id;
      v_request.dedup_original_document_serial := v_source_document_serial;
    elsif v_source_state not in ('idle','error') or v_source_record_id is not null then
      raise exception 'สถานะ JV เงินสดเปลี่ยนระหว่างอนุมัติ กรุณาลองใหม่หลัง Sync เสร็จ';
    end if;
  elsif v_request.payment_method = 'transfer' and v_request.dedup_action = 'reduce_future_revenue_journal' then
    perform 1 from ttb_promptpay_reports where report_date = v_request.document_date and not is_deleted for update;
    select count(*), count(*) filter (where sync_state = 'synced' and flowaccount_record_id is not null and flowaccount_document_serial is not null),
      max(flowaccount_record_id), max(flowaccount_document_serial)
      into v_source_total, v_source_synced, v_source_record_id, v_source_document_serial
      from ttb_promptpay_reports where report_date = v_request.document_date and not is_deleted;
    if v_source_total = 1 and v_source_synced = 1 then
      v_request.dedup_action := 'reversal_journal';
      v_request.dedup_original_record_id := v_source_record_id;
      v_request.dedup_original_document_serial := v_source_document_serial;
    elsif exists (select 1 from ttb_promptpay_reports where report_date = v_request.document_date
      and not is_deleted and (sync_state not in ('idle','error') or flowaccount_record_id is not null)) then
      raise exception 'สถานะ JV TTB เปลี่ยนระหว่างอนุมัติ กรุณาลองใหม่หลัง Sync เสร็จ';
    end if;
  elsif v_request.payment_method = 'credit_card' and v_request.dedup_action = 'reduce_future_edc_cash_sale' then
    select cash_sale_record_id, cash_sale_document_serial
      into v_source_record_id, v_source_document_serial
      from linepay_edc_revenue_days where revenue_date = v_request.document_date and not is_deleted for update;
    if v_source_record_id is not null and v_source_document_serial is not null then
      v_request.dedup_action := 'replace_edc_cash_sale';
      v_request.dedup_original_record_id := v_source_record_id;
      v_request.dedup_original_document_serial := v_source_document_serial;
    end if;
  end if;

  if v_request.payment_method = 'credit_card'
    and v_request.dedup_action in ('reduce_future_edc_cash_sale', 'replace_edc_cash_sale') then
    update linepay_edc_revenue_days set
      full_tax_invoice_satang = full_tax_invoice_satang + v_request.total_satang,
      updated_at = now()
    where revenue_date = v_request.document_date and not is_deleted;
    if not found then raise exception 'ไม่พบยอด EDC สำหรับบันทึกใบกำกับภาษี'; end if;
  elsif v_request.payment_method = 'cash'
    and v_request.dedup_action = 'reduce_future_revenue_journal' then
    update daily_sales set
      full_tax_invoice_cash_satang = full_tax_invoice_cash_satang + v_request.total_satang
    where id = v_request.document_date::text;
    if not found then raise exception 'ไม่พบยอดเงินสดสำหรับบันทึกใบกำกับภาษี'; end if;
  elsif v_request.payment_method = 'transfer'
    and v_request.dedup_action = 'reduce_future_revenue_journal' then
    v_to_allocate := v_request.total_satang;
    for v_report in
      select id, successful_amount_satang, full_tax_invoice_satang
      from ttb_promptpay_reports
      where report_date = v_request.document_date and not is_deleted
      order by created_at, id for update
    loop
      exit when v_to_allocate = 0;
      v_report_allocation := least(v_to_allocate, v_report.successful_amount_satang - v_report.full_tax_invoice_satang);
      update ttb_promptpay_reports set
        full_tax_invoice_satang = full_tax_invoice_satang + v_report_allocation,
        updated_at = now()
      where id = v_report.id;
      v_to_allocate := v_to_allocate - v_report_allocation;
    end loop;
    if v_to_allocate <> 0 then raise exception 'ไม่สามารถจัดสรรยอดใบกำกับภาษีเข้ารายงาน TTB ได้ครบ'; end if;
  end if;

  update tax_invoice_requests set
    status = 'created', flowaccount_record_id = p_record_id,
    flowaccount_document_serial = p_document_serial, dedup_state = 'invoice_created',
    dedup_action = v_request.dedup_action,
    dedup_original_record_id = v_request.dedup_original_record_id,
    dedup_original_document_serial = v_request.dedup_original_document_serial,
    dedup_state_changed_at = now(), dedup_error = null
  where id = p_request_id returning * into v_request;
  return to_jsonb(v_request);
end;
$$;

revoke all on function record_tax_invoice_created(uuid,integer,text) from public, anon, authenticated;
grant execute on function record_tax_invoice_created(uuid,integer,text) to service_role;
