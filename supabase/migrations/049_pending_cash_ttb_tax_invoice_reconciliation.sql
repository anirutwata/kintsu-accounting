alter table tax_invoice_requests drop constraint if exists tax_invoice_requests_dedup_action_check;
alter table tax_invoice_requests add constraint tax_invoice_requests_dedup_action_check check (
  dedup_action is null or dedup_action in (
    'reversal_journal', 'reduce_future_revenue_journal', 'reduce_future_edc_cash_sale',
    'replace_edc_cash_sale', 'manual_review_closed_vat_period',
    'manual_review_historical_documents', 'manual_review_source_document_state', 'historical_review',
    'pending_edc_report', 'manual_review_edc_pool_exceeded',
    'pending_cash_sales', 'pending_ttb_report', 'manual_review_revenue_pool_exceeded'
  )
);

create or replace function reserve_tax_invoice_revenue_v2(p_request_id uuid, p_today date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_request tax_invoice_requests%rowtype;
begin
  begin
    return reserve_tax_invoice_revenue(p_request_id, p_today);
  exception when others then
    if sqlerrm not like 'ไม่พบยอด authoritative ช่องทาง %' then raise; end if;
  end;
  select * into v_request from tax_invoice_requests where id=p_request_id and not is_deleted for update;
  if not found or v_request.dedup_state <> 'unreserved' or v_request.status <> 'processing' then
    raise exception 'คำขอใบกำกับภาษีไม่อยู่ในสถานะที่รอยอดรายวันได้';
  end if;
  if v_request.document_date <> p_today then
    raise exception 'ไม่พบยอด authoritative ช่องทาง % วันที่ %', v_request.payment_method, v_request.document_date;
  end if;
  if v_request.payment_method = 'cash' then
    v_request.dedup_action := 'pending_cash_sales';
  elsif v_request.payment_method = 'transfer' then
    v_request.dedup_action := 'pending_ttb_report';
  else
    raise exception 'ไม่พบยอด authoritative ช่องทาง % วันที่ %', v_request.payment_method, v_request.document_date;
  end if;
  update tax_invoice_requests set dedup_action=v_request.dedup_action, dedup_state='reserved',
    dedup_authoritative_satang=null, dedup_remaining_satang=null,
    dedup_state_changed_at=now(), dedup_error=null where id=v_request.id returning * into v_request;
  return to_jsonb(v_request);
end; $$;
revoke all on function reserve_tax_invoice_revenue_v2(uuid,date) from public, anon, authenticated;
grant execute on function reserve_tax_invoice_revenue_v2(uuid,date) to service_role;

create or replace function reconcile_pending_cash_tax_invoices(p_revenue_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale daily_sales%rowtype; v_request tax_invoice_requests%rowtype;
  v_authoritative bigint; v_available bigint; v_completed uuid[]='{}'; v_manual uuid[]='{}';
begin
  select * into v_sale from daily_sales where id=p_revenue_date::text for update;
  if not found then raise exception 'ไม่พบยอดขายเงินสดวันที่ %', p_revenue_date; end if;
  v_authoritative := coalesce(v_sale.cash_satang,0)+coalesce(v_sale.papaya_cash_satang,0);
  for v_request in select * from tax_invoice_requests where document_date=p_revenue_date
    and payment_method='cash' and dedup_state='invoice_created' and dedup_action='pending_cash_sales'
    and not is_deleted order by created_at,id for update loop
    v_available := v_authoritative-v_sale.full_tax_invoice_cash_satang;
    if v_available >= v_request.total_satang then
      update daily_sales set full_tax_invoice_cash_satang=full_tax_invoice_cash_satang+v_request.total_satang
        where id=v_sale.id returning * into v_sale;
      update tax_invoice_requests set dedup_action='reduce_future_revenue_journal',dedup_state='complete',
        dedup_authoritative_satang=v_authoritative,dedup_remaining_satang=v_authoritative-v_sale.full_tax_invoice_cash_satang,
        dedup_state_changed_at=now(),dedup_error=null where id=v_request.id;
      v_completed:=v_completed||v_request.id;
    else
      update tax_invoice_requests set dedup_action='manual_review_revenue_pool_exceeded',dedup_state='manual_review',
        dedup_authoritative_satang=v_authoritative,dedup_remaining_satang=v_available,dedup_state_changed_at=now(),
        dedup_error=format('ยอดเงินสด authoritative วันที่ %s เหลือ %s สตางค์ ไม่พอสำหรับใบกำกับภาษีนี้ (%s สตางค์)',p_revenue_date,v_available,v_request.total_satang)
        where id=v_request.id;
      v_manual:=v_manual||v_request.id;
    end if;
  end loop;
  return jsonb_build_object('completed_ids',to_jsonb(v_completed),'manual_review_ids',to_jsonb(v_manual));
end; $$;

create or replace function reconcile_pending_ttb_tax_invoices(p_revenue_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_report ttb_promptpay_reports%rowtype; v_request tax_invoice_requests%rowtype;
  v_available bigint; v_completed uuid[]='{}'; v_manual uuid[]='{}';
begin
  select * into v_report from ttb_promptpay_reports where report_date=p_revenue_date and not is_deleted for update;
  if not found then raise exception 'ไม่พบรายงาน TTB วันที่ %',p_revenue_date; end if;
  for v_request in select * from tax_invoice_requests where document_date=p_revenue_date
    and payment_method='transfer' and dedup_state='invoice_created' and dedup_action='pending_ttb_report'
    and not is_deleted order by created_at,id for update loop
    v_available:=v_report.successful_amount_satang-v_report.full_tax_invoice_satang;
    if v_available >= v_request.total_satang then
      update ttb_promptpay_reports set full_tax_invoice_satang=full_tax_invoice_satang+v_request.total_satang,updated_at=now()
        where id=v_report.id returning * into v_report;
      update tax_invoice_requests set dedup_action='reduce_future_revenue_journal',dedup_state='complete',
        dedup_authoritative_satang=v_report.successful_amount_satang,
        dedup_remaining_satang=v_report.successful_amount_satang-v_report.full_tax_invoice_satang,
        dedup_state_changed_at=now(),dedup_error=null where id=v_request.id;
      v_completed:=v_completed||v_request.id;
    else
      update tax_invoice_requests set dedup_action='manual_review_revenue_pool_exceeded',dedup_state='manual_review',
        dedup_authoritative_satang=v_report.successful_amount_satang,dedup_remaining_satang=v_available,
        dedup_state_changed_at=now(),dedup_error=format('ยอด TTB authoritative วันที่ %s เหลือ %s สตางค์ ไม่พอสำหรับใบกำกับภาษีนี้ (%s สตางค์)',p_revenue_date,v_available,v_request.total_satang)
        where id=v_request.id;
      v_manual:=v_manual||v_request.id;
    end if;
  end loop;
  return jsonb_build_object('completed_ids',to_jsonb(v_completed),'manual_review_ids',to_jsonb(v_manual));
end; $$;

revoke all on function reconcile_pending_cash_tax_invoices(date) from public,anon,authenticated;
revoke all on function reconcile_pending_ttb_tax_invoices(date) from public,anon,authenticated;
grant execute on function reconcile_pending_cash_tax_invoices(date) to service_role;
grant execute on function reconcile_pending_ttb_tax_invoices(date) to service_role;
