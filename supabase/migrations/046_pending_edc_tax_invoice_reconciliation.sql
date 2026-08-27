-- The LINE Pay EDC settlement CSV always lags one day behind the sale, so a
-- credit_card full tax invoice requested on the sale date (or the day after,
-- before that day's cron has run) has no authoritative pool to check yet.
-- Previously this hard-blocked invoice creation until the report arrived.
-- Customers need the tax invoice document immediately; only the revenue-dedup
-- allocation against the day's EDC total can wait. This migration lets
-- reserve_tax_invoice_revenue issue a 'pending_edc_report' placeholder in that
-- narrow window so the invoice can be created now, and adds
-- reconcile_pending_edc_tax_invoices to finish the allocation once the report
-- is imported (called from importLinePayEdcFromGmail before the day's Cash
-- Sale is synced, so the Cash Sale nets out the invoiced amount as usual).

alter table tax_invoice_requests drop constraint if exists tax_invoice_requests_dedup_action_check;
alter table tax_invoice_requests add constraint tax_invoice_requests_dedup_action_check check (
  dedup_action is null or dedup_action in (
    'reversal_journal', 'reduce_future_revenue_journal', 'reduce_future_edc_cash_sale',
    'replace_edc_cash_sale', 'manual_review_closed_vat_period',
    'manual_review_historical_documents', 'manual_review_source_document_state', 'historical_review',
    'pending_edc_report', 'manual_review_edc_pool_exceeded'
  )
);

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
    -- LINE Pay's settlement report for `document_date` is always imported the
    -- next day. Within that unavoidable gap, let the invoice go out now and
    -- finish the revenue-dedup allocation later via reconcile_pending_edc_tax_invoices.
    -- Any other missing-pool case (older dates, cash/transfer) still blocks: it
    -- means the source data is actually missing, not merely not-yet-arrived.
    if v_request.payment_method = 'credit_card' and v_request.document_date >= p_today - 1 then
      update tax_invoice_requests set
        dedup_action = 'pending_edc_report',
        dedup_state = 'reserved',
        dedup_authoritative_satang = null,
        dedup_remaining_satang = null,
        dedup_state_changed_at = now(),
        dedup_error = null
      where id = v_request.id
      returning * into v_request;
      return to_jsonb(v_request);
    end if;
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

-- Finalizes every 'pending_edc_report' request for a revenue date once that
-- day's LINE Pay EDC settlement report has been imported. Must run before the
-- day's Cash Sale is synced so gross_amount_satang - full_tax_invoice_satang
-- already nets out these invoices (same mechanism as reduce_future_edc_cash_sale).
create or replace function reconcile_pending_edc_tax_invoices(p_revenue_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue_day linepay_edc_revenue_days%rowtype;
  v_request tax_invoice_requests%rowtype;
  v_available bigint;
  v_completed_ids uuid[] := '{}';
  v_manual_review_ids uuid[] := '{}';
begin
  select * into v_revenue_day from linepay_edc_revenue_days
    where revenue_date = p_revenue_date and not is_deleted for update;
  if not found then raise exception 'ไม่พบยอด EDC วันที่ %', p_revenue_date; end if;

  for v_request in
    select * from tax_invoice_requests
    where document_date = p_revenue_date and payment_method = 'credit_card'
      and dedup_state = 'invoice_created' and dedup_action = 'pending_edc_report'
      and not is_deleted
    order by created_at, id
    for update
  loop
    v_available := v_revenue_day.gross_amount_satang - v_revenue_day.full_tax_invoice_satang;
    if v_available >= v_request.total_satang then
      update linepay_edc_revenue_days set
        full_tax_invoice_satang = full_tax_invoice_satang + v_request.total_satang,
        updated_at = now()
      where id = v_revenue_day.id
      returning * into v_revenue_day;
      update tax_invoice_requests set
        dedup_action = 'reduce_future_edc_cash_sale',
        dedup_state = 'complete',
        dedup_authoritative_satang = v_revenue_day.gross_amount_satang,
        dedup_remaining_satang = v_revenue_day.gross_amount_satang - v_revenue_day.full_tax_invoice_satang,
        dedup_state_changed_at = now(),
        dedup_error = null
      where id = v_request.id;
      v_completed_ids := v_completed_ids || v_request.id;
    else
      -- The day's actual settled total ended up smaller than what was already
      -- invoiced to customers (e.g. a receipt total that didn't match the EDC
      -- batch). Leave the invoice in place and flag for manual accounting review.
      update tax_invoice_requests set
        dedup_action = 'manual_review_edc_pool_exceeded',
        dedup_state = 'manual_review',
        dedup_authoritative_satang = v_revenue_day.gross_amount_satang,
        dedup_remaining_satang = v_available,
        dedup_state_changed_at = now(),
        dedup_error = format(
          'ยอด EDC authoritative วันที่ %s เหลือ %s สตางค์ ไม่พอสำหรับใบกำกับภาษีนี้ (%s สตางค์)',
          p_revenue_date, v_available, v_request.total_satang
        )
      where id = v_request.id;
      v_manual_review_ids := v_manual_review_ids || v_request.id;
    end if;
  end loop;

  return jsonb_build_object('completed_ids', to_jsonb(v_completed_ids), 'manual_review_ids', to_jsonb(v_manual_review_ids));
end;
$$;

revoke all on function reconcile_pending_edc_tax_invoices(date) from public, anon, authenticated;
grant execute on function reconcile_pending_edc_tax_invoices(date) to service_role;
