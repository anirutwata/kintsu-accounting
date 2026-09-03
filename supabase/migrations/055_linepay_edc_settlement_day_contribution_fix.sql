-- import_linepay_edc_report's per-day contribution check re-derives each transaction's
-- revenue date straight from transaction_time (Bangkok-local date), independent of the
-- application layer. lib/edcDailyReport.ts's effectiveRevenueDate() (see the
-- "transaction_time == settlement_date" fix) treats a transaction dated exactly on its own
-- settlement date as belonging to the day before -- but this function never learned that
-- correction, so it kept expecting those transactions on their raw (uncorrected) date. Every
-- report hitting that same-day-as-settlement quirk failed here with "ธุรกรรม EDC ของวันขาย %
-- ไม่ตรงกับ contribution", even though the report/revenue-day payloads sent by the app were
-- already using the corrected date. Apply the identical correction here so the two layers
-- agree again.
create or replace function import_linepay_edc_report(
  p_report jsonb,
  p_revenue_days jsonb,
  p_transactions jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_day jsonb;
  v_transaction jsonb;
  v_revenue_day_id uuid;
  v_existing linepay_edc_revenue_days%rowtype;
  v_count integer;
  v_gross bigint;
  v_fee bigint;
  v_fee_vat bigint;
  v_net bigint;
begin
  if jsonb_typeof(p_revenue_days) <> 'array' or jsonb_array_length(p_revenue_days) = 0
    or jsonb_typeof(p_transactions) <> 'array' or jsonb_array_length(p_transactions) = 0 then
    raise exception 'รายงาน EDC ต้องมีวันขายและธุรกรรม';
  end if;
  if (select count(distinct value->>'revenue_date') from jsonb_array_elements(p_revenue_days))
    <> jsonb_array_length(p_revenue_days) then
    raise exception 'วันขาย EDC ซ้ำใน payload';
  end if;

  select count(*), sum((value->>'amount_satang')::integer),
    sum((value->>'fee_amount_satang')::integer), sum((value->>'fee_vat_satang')::integer),
    sum((value->>'net_amount_satang')::integer)
  into v_count, v_gross, v_fee, v_fee_vat, v_net
  from jsonb_array_elements(p_transactions);
  if v_count <> (p_report->>'transaction_count')::integer
    or v_gross <> (p_report->>'gross_amount_satang')::integer
    or v_fee <> (p_report->>'fee_amount_satang')::integer
    or v_fee_vat <> (p_report->>'fee_vat_satang')::integer
    or v_net <> (p_report->>'net_amount_satang')::integer then
    raise exception 'ยอดรวม transactions EDC ไม่ตรงกับ report';
  end if;

  select sum((value->>'transaction_count')::integer),
    sum((value->>'gross_amount_satang')::integer), sum((value->>'fee_amount_satang')::integer),
    sum((value->>'fee_vat_satang')::integer), sum((value->>'net_amount_satang')::integer)
  into v_count, v_gross, v_fee, v_fee_vat, v_net
  from jsonb_array_elements(p_revenue_days);
  if v_count <> (p_report->>'transaction_count')::integer
    or v_gross <> (p_report->>'gross_amount_satang')::integer
    or v_fee <> (p_report->>'fee_amount_satang')::integer
    or v_fee_vat <> (p_report->>'fee_vat_satang')::integer
    or v_net <> (p_report->>'net_amount_satang')::integer then
    raise exception 'ยอดรวมวันขาย EDC ไม่ตรงกับ report';
  end if;

  insert into linepay_edc_reports (
    revenue_date, settlement_date, gmail_message_id, attachment_sha256,
    attachment_name, merchant_id, merchant_name, terminal_id,
    transaction_count, gross_amount_satang, fee_amount_satang,
    fee_vat_satang, net_amount_satang
  ) values (
    (p_report->>'revenue_date')::date, (p_report->>'settlement_date')::date,
    p_report->>'gmail_message_id', p_report->>'attachment_sha256',
    p_report->>'attachment_name', p_report->>'merchant_id',
    p_report->>'merchant_name', p_report->>'terminal_id',
    (p_report->>'transaction_count')::integer,
    (p_report->>'gross_amount_satang')::integer,
    (p_report->>'fee_amount_satang')::integer,
    (p_report->>'fee_vat_satang')::integer,
    (p_report->>'net_amount_satang')::integer
  ) returning id into v_report_id;

  for v_day in select value from jsonb_array_elements(p_revenue_days)
  loop
    select count(*), sum((value->>'amount_satang')::integer),
      sum((value->>'fee_amount_satang')::integer), sum((value->>'fee_vat_satang')::integer),
      sum((value->>'net_amount_satang')::integer)
    into v_count, v_gross, v_fee, v_fee_vat, v_net
    from jsonb_array_elements(p_transactions)
    where (
      case
        -- Same "transaction_time == settlement_date -> day before" correction as
        -- lib/edcDailyReport.ts's effectiveRevenueDate().
        when ((value->>'transaction_time')::timestamptz at time zone 'Asia/Bangkok')::date
          = (p_report->>'settlement_date')::date
          then ((value->>'transaction_time')::timestamptz at time zone 'Asia/Bangkok')::date - 1
        else ((value->>'transaction_time')::timestamptz at time zone 'Asia/Bangkok')::date
      end
    ) = (v_day->>'revenue_date')::date;
    if v_count <> (v_day->>'transaction_count')::integer
      or v_gross <> (v_day->>'gross_amount_satang')::integer
      or v_fee <> (v_day->>'fee_amount_satang')::integer
      or v_fee_vat <> (v_day->>'fee_vat_satang')::integer
      or v_net <> (v_day->>'net_amount_satang')::integer then
      raise exception 'ธุรกรรม EDC ของวันขาย % ไม่ตรงกับ contribution', v_day->>'revenue_date';
    end if;

    select * into v_existing from linepay_edc_revenue_days
      where revenue_date = (v_day->>'revenue_date')::date and not is_deleted
      for update;
    if found then
      if v_existing.cash_sale_sync_state in ('creating','replacing','cleanup_pending') then
        raise exception 'วันขาย EDC % กำลัง Sync/cleanup', v_existing.revenue_date;
      end if;
      update linepay_edc_revenue_days set
        transaction_count = transaction_count + (v_day->>'transaction_count')::integer,
        gross_amount_satang = gross_amount_satang + (v_day->>'gross_amount_satang')::integer,
        fee_amount_satang = fee_amount_satang + (v_day->>'fee_amount_satang')::integer,
        fee_vat_satang = fee_vat_satang + (v_day->>'fee_vat_satang')::integer,
        net_amount_satang = net_amount_satang + (v_day->>'net_amount_satang')::integer,
        cash_sale_sync_state = case when cash_sale_record_id is null then 'idle' else 'replacing' end,
        cash_sale_cleanup_record_id = cash_sale_record_id,
        cash_sale_sync_error = null, updated_at = now()
      where id = v_existing.id returning id into v_revenue_day_id;
    else
      insert into linepay_edc_revenue_days (
        revenue_date, transaction_count, gross_amount_satang,
        fee_amount_satang, fee_vat_satang, net_amount_satang
      ) values (
        (v_day->>'revenue_date')::date, (v_day->>'transaction_count')::integer,
        (v_day->>'gross_amount_satang')::integer,
        (v_day->>'fee_amount_satang')::integer,
        (v_day->>'fee_vat_satang')::integer,
        (v_day->>'net_amount_satang')::integer
      ) returning id into v_revenue_day_id;
    end if;

    insert into linepay_edc_report_revenue_days (
      report_id, revenue_day_id, revenue_date, transaction_count,
      gross_amount_satang, fee_amount_satang, fee_vat_satang, net_amount_satang
    ) values (
      v_report_id, v_revenue_day_id, (v_day->>'revenue_date')::date,
      (v_day->>'transaction_count')::integer,
      (v_day->>'gross_amount_satang')::integer,
      (v_day->>'fee_amount_satang')::integer,
      (v_day->>'fee_vat_satang')::integer,
      (v_day->>'net_amount_satang')::integer
    );
  end loop;

  for v_transaction in select value from jsonb_array_elements(p_transactions)
  loop
    insert into linepay_edc_transactions (
      report_id, transaction_id, transaction_time, service_name,
      amount_satang, fee_rate, fee_amount_satang, fee_vat_satang,
      net_amount_satang
    ) values (
      v_report_id, v_transaction->>'transaction_id',
      (v_transaction->>'transaction_time')::timestamptz,
      v_transaction->>'service_name',
      (v_transaction->>'amount_satang')::integer,
      (v_transaction->>'fee_rate')::numeric,
      (v_transaction->>'fee_amount_satang')::integer,
      (v_transaction->>'fee_vat_satang')::integer,
      (v_transaction->>'net_amount_satang')::integer
    );
  end loop;

  insert into daily_sales (
    id, date, linepay_edc_gross_satang, linepay_edc_report_id, updated_at
  )
  select day.revenue_date, day.revenue_date, day.gross_amount_satang, v_report_id, now()
  from linepay_edc_revenue_days day
  where day.revenue_date in (
    select (value->>'revenue_date')::date from jsonb_array_elements(p_revenue_days)
  ) and not day.is_deleted
  on conflict (id) do update set
    linepay_edc_gross_satang = excluded.linepay_edc_gross_satang,
    linepay_edc_report_id = excluded.linepay_edc_report_id,
    updated_at = excluded.updated_at;

  return v_report_id;
end;
$$;
