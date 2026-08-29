-- reserve_tax_invoice_revenue_v3 (migration 050) only deferred a cash/transfer
-- request when document_date was exactly today, so a request made after
-- midnight for yesterday's receipt fell through to the original
-- reserve_tax_invoice_revenue and hit the original hard "ไม่พบยอด authoritative"
-- block again — the same gap pending_edc_report (migration 046) already closed
-- for credit_card via a same-day-or-yesterday window. Widen the cash/transfer
-- window to match.

create or replace function reserve_tax_invoice_revenue_v3(p_request_id uuid, p_today date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_request tax_invoice_requests%rowtype; v_source_exists boolean;
begin
  select * into v_request from tax_invoice_requests where id=p_request_id and not is_deleted for update;
  if not found then raise exception 'ไม่พบคำขอใบกำกับภาษี'; end if;
  if v_request.dedup_state <> 'unreserved' then return to_jsonb(v_request); end if;
  if v_request.document_date not between p_today - 1 and p_today or v_request.payment_method not in ('cash','transfer') then
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

revoke all on function reserve_tax_invoice_revenue_v3(uuid,date) from public,anon,authenticated;
grant execute on function reserve_tax_invoice_revenue_v3(uuid,date) to service_role;
