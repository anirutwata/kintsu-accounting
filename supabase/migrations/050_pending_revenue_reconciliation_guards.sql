create or replace function reserve_tax_invoice_revenue_v3(p_request_id uuid, p_today date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_request tax_invoice_requests%rowtype; v_source_exists boolean;
begin
  select * into v_request from tax_invoice_requests where id=p_request_id and not is_deleted for update;
  if not found then raise exception 'ไม่พบคำขอใบกำกับภาษี'; end if;
  if v_request.dedup_state <> 'unreserved' then return to_jsonb(v_request); end if;
  if v_request.document_date <> p_today or v_request.payment_method not in ('cash','transfer') then
    return reserve_tax_invoice_revenue(p_request_id,p_today);
  end if;
  if v_request.payment_method='cash' then
    select exists(select 1 from daily_sales where id=v_request.document_date::text) into v_source_exists;
  else
    select exists(select 1 from ttb_promptpay_reports where report_date=v_request.document_date and not is_deleted) into v_source_exists;
  end if;
  if v_source_exists then return reserve_tax_invoice_revenue(p_request_id,p_today); end if;
  if v_request.status <> 'processing' then raise exception 'คำขอใบกำกับภาษียังไม่ได้รับการอนุมัติ'; end if;
  v_request.dedup_action:=case when v_request.payment_method='cash' then 'pending_cash_sales' else 'pending_ttb_report' end;
  update tax_invoice_requests set dedup_action=v_request.dedup_action,dedup_state='reserved',
    dedup_authoritative_satang=null,dedup_remaining_satang=null,dedup_state_changed_at=now(),dedup_error=null
    where id=v_request.id returning * into v_request;
  return to_jsonb(v_request);
end; $$;

create or replace function reconcile_pending_cash_tax_invoices_v2(p_revenue_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_manual uuid[];
begin
  v_result:=reconcile_pending_cash_tax_invoices(p_revenue_date);
  select coalesce(array_agg(id),'{}') into v_manual from tax_invoice_requests where document_date=p_revenue_date
    and payment_method='cash' and dedup_state='manual_review' and dedup_action='manual_review_revenue_pool_exceeded' and not is_deleted;
  return jsonb_build_object('completed_ids',v_result->'completed_ids','manual_review_ids',to_jsonb(v_manual));
end; $$;

create or replace function reconcile_pending_ttb_tax_invoices_v2(p_revenue_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_manual uuid[];
begin
  v_result:=reconcile_pending_ttb_tax_invoices(p_revenue_date);
  select coalesce(array_agg(id),'{}') into v_manual from tax_invoice_requests where document_date=p_revenue_date
    and payment_method='transfer' and dedup_state='manual_review' and dedup_action='manual_review_revenue_pool_exceeded' and not is_deleted;
  return jsonb_build_object('completed_ids',v_result->'completed_ids','manual_review_ids',to_jsonb(v_manual));
end; $$;

revoke all on function reserve_tax_invoice_revenue_v3(uuid,date) from public,anon,authenticated;
revoke all on function reconcile_pending_cash_tax_invoices_v2(date) from public,anon,authenticated;
revoke all on function reconcile_pending_ttb_tax_invoices_v2(date) from public,anon,authenticated;
grant execute on function reserve_tax_invoice_revenue_v3(uuid,date) to service_role;
grant execute on function reconcile_pending_cash_tax_invoices_v2(date) to service_role;
grant execute on function reconcile_pending_ttb_tax_invoices_v2(date) to service_role;
