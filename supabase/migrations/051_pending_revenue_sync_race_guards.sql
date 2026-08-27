-- Serialize cash/TTB revenue sync with tax-invoice allocation.  A pending
-- invoice that is still being written must block the daily JV, and a JV claim
-- must return the source row after acquiring the same advisory lock used by
-- tax-invoice reservation/recording.

create or replace function reconcile_pending_cash_tax_invoices_v3(p_revenue_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_blocking uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_revenue_date::text || ':cash', 0));
  v_result:=reconcile_pending_cash_tax_invoices_v2(p_revenue_date);
  select coalesce(array_agg(id),'{}') into v_blocking
    from tax_invoice_requests where document_date=p_revenue_date
      and payment_method='cash' and dedup_state='reserved'
      and dedup_action='pending_cash_sales' and not is_deleted;
  return v_result || jsonb_build_object('blocking_ids',to_jsonb(v_blocking));
end; $$;

create or replace function reconcile_pending_ttb_tax_invoices_v3(p_revenue_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_blocking uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_revenue_date::text || ':transfer', 0));
  v_result:=reconcile_pending_ttb_tax_invoices_v2(p_revenue_date);
  select coalesce(array_agg(id),'{}') into v_blocking
    from tax_invoice_requests where document_date=p_revenue_date
      and payment_method='transfer' and dedup_state='reserved'
      and dedup_action='pending_ttb_report' and not is_deleted;
  return v_result || jsonb_build_object('blocking_ids',to_jsonb(v_blocking));
end; $$;

create or replace function claim_cash_revenue_sync(p_revenue_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sale daily_sales%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_revenue_date::text || ':cash', 0));
  update daily_sales set flowaccount_cash_journal_state='creating',
    flowaccount_cash_sync_error=null,flowaccount_cash_state_changed_at=now()
    where id=p_revenue_date::text and flowaccount_cash_record_id is null
      and flowaccount_cash_journal_state in ('idle','error')
    returning * into v_sale;
  if not found then return null; end if;
  return to_jsonb(v_sale);
end; $$;

create or replace function claim_ttb_revenue_sync(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_report ttb_promptpay_reports%rowtype;
begin
  select * into v_report from ttb_promptpay_reports
    where id=p_report_id and not is_deleted;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_report.report_date::text || ':transfer', 0));
  update ttb_promptpay_reports set sync_state='creating',sync_error=null,updated_at=now()
    where id=p_report_id and not is_deleted and sync_state in ('idle','error')
      and flowaccount_record_id is null returning * into v_report;
  if not found then return null; end if;
  return to_jsonb(v_report);
end; $$;

revoke all on function reconcile_pending_cash_tax_invoices_v3(date) from public,anon,authenticated;
revoke all on function reconcile_pending_ttb_tax_invoices_v3(date) from public,anon,authenticated;
revoke all on function claim_cash_revenue_sync(date) from public,anon,authenticated;
revoke all on function claim_ttb_revenue_sync(uuid) from public,anon,authenticated;
grant execute on function reconcile_pending_cash_tax_invoices_v3(date) to service_role;
grant execute on function reconcile_pending_ttb_tax_invoices_v3(date) to service_role;
grant execute on function claim_cash_revenue_sync(date) to service_role;
grant execute on function claim_ttb_revenue_sync(uuid) to service_role;
