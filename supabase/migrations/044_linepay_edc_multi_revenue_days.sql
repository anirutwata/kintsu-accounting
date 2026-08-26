-- One settlement report may include more than one sale date, and one sale date may
-- be split across later settlements. Keep one aggregate Cash Sale per sale date.
create table if not exists linepay_edc_revenue_days (
  id uuid primary key default gen_random_uuid(),
  revenue_date date not null,
  transaction_count integer not null check (transaction_count > 0),
  gross_amount_satang integer not null check (gross_amount_satang > 0),
  fee_amount_satang integer not null check (fee_amount_satang >= 0),
  fee_vat_satang integer not null check (fee_vat_satang >= 0),
  net_amount_satang integer not null check (net_amount_satang >= 0),
  cash_sale_record_id integer,
  cash_sale_document_serial text,
  cash_sale_synced_amount_satang integer,
  cash_sale_synced_at timestamptz,
  cash_sale_sync_state text not null default 'idle'
    check (cash_sale_sync_state in ('idle','creating','synced','replacing','cleanup_pending','error')),
  cash_sale_cleanup_record_id integer,
  cash_sale_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  check (gross_amount_satang = fee_amount_satang + fee_vat_satang + net_amount_satang)
);

create table if not exists linepay_edc_report_revenue_days (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references linepay_edc_reports(id),
  revenue_day_id uuid not null references linepay_edc_revenue_days(id),
  revenue_date date not null,
  transaction_count integer not null check (transaction_count > 0),
  gross_amount_satang integer not null check (gross_amount_satang > 0),
  fee_amount_satang integer not null check (fee_amount_satang >= 0),
  fee_vat_satang integer not null check (fee_vat_satang >= 0),
  net_amount_satang integer not null check (net_amount_satang >= 0),
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  check (gross_amount_satang = fee_amount_satang + fee_vat_satang + net_amount_satang)
);

drop index if exists linepay_edc_reports_revenue_date_uidx;
create unique index if not exists linepay_edc_revenue_days_date_uidx
  on linepay_edc_revenue_days(revenue_date) where not is_deleted;
create unique index if not exists linepay_edc_report_revenue_days_report_date_uidx
  on linepay_edc_report_revenue_days(report_id, revenue_date) where not is_deleted;
create index if not exists linepay_edc_report_revenue_days_day_idx
  on linepay_edc_report_revenue_days(revenue_day_id) where not is_deleted;

-- Preserve the already-synced report in the new aggregate model.
insert into linepay_edc_revenue_days (
  revenue_date, transaction_count, gross_amount_satang, fee_amount_satang,
  fee_vat_satang, net_amount_satang, cash_sale_record_id,
  cash_sale_document_serial, cash_sale_synced_amount_satang, cash_sale_synced_at,
  cash_sale_sync_state, cash_sale_cleanup_record_id, cash_sale_sync_error,
  updated_at, is_deleted, deleted_at
)
select
  revenue_date, transaction_count, gross_amount_satang, fee_amount_satang,
  fee_vat_satang, net_amount_satang, cash_sale_record_id,
  cash_sale_document_serial,
  case when cash_sale_record_id is not null then gross_amount_satang end,
  cash_sale_synced_at, cash_sale_sync_state, cash_sale_cleanup_record_id,
  cash_sale_sync_error, updated_at, is_deleted, deleted_at
from linepay_edc_reports
where not is_deleted
on conflict do nothing;

insert into linepay_edc_report_revenue_days (
  report_id, revenue_day_id, revenue_date, transaction_count,
  gross_amount_satang, fee_amount_satang, fee_vat_satang, net_amount_satang,
  is_deleted, deleted_at
)
select
  report.id, day.id, report.revenue_date, report.transaction_count,
  report.gross_amount_satang, report.fee_amount_satang,
  report.fee_vat_satang, report.net_amount_satang,
  report.is_deleted, report.deleted_at
from linepay_edc_reports report
join linepay_edc_revenue_days day on day.revenue_date = report.revenue_date
where not report.is_deleted and not day.is_deleted
on conflict do nothing;

-- Import all report rows atomically. Any duplicate transaction or constraint error
-- rolls back the report, contributions, aggregate day, transactions and daily_sales.
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
    where (((value->>'transaction_time')::timestamptz at time zone 'Asia/Bangkok')::date)
      = (v_day->>'revenue_date')::date;
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

alter table linepay_edc_revenue_days disable row level security;
alter table linepay_edc_report_revenue_days disable row level security;

revoke all on function import_linepay_edc_report(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function import_linepay_edc_report(jsonb,jsonb,jsonb) to service_role;
