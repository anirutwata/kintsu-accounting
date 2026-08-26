-- Import authoritative LINE Pay EDC daily settlement CSV files from Gmail.
create table if not exists linepay_edc_reports (
  id uuid primary key default gen_random_uuid(),
  revenue_date date not null,
  settlement_date date not null,
  gmail_message_id text not null,
  attachment_sha256 text not null,
  attachment_name text not null,
  merchant_id text not null,
  merchant_name text not null,
  terminal_id text not null,
  transaction_count integer not null check (transaction_count > 0),
  gross_amount_satang integer not null check (gross_amount_satang > 0),
  fee_amount_satang integer not null check (fee_amount_satang >= 0),
  fee_vat_satang integer not null check (fee_vat_satang >= 0),
  net_amount_satang integer not null check (net_amount_satang >= 0),
  cash_sale_record_id integer,
  cash_sale_document_serial text,
  cash_sale_synced_at timestamptz,
  cash_sale_sync_state text not null default 'idle'
    check (cash_sale_sync_state in ('idle','creating','synced','cleanup_pending','error')),
  cash_sale_cleanup_record_id integer,
  cash_sale_sync_error text,
  settlement_record_id integer,
  settlement_document_serial text,
  settlement_synced_at timestamptz,
  settlement_sync_state text not null default 'idle'
    check (settlement_sync_state in ('idle','creating','synced','cleanup_pending','error')),
  settlement_cleanup_record_id integer,
  settlement_sync_error text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  check (gross_amount_satang = fee_amount_satang + fee_vat_satang + net_amount_satang)
);

create table if not exists linepay_edc_transactions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references linepay_edc_reports(id),
  transaction_id text not null,
  transaction_time timestamptz not null,
  service_name text not null,
  amount_satang integer not null check (amount_satang > 0),
  fee_rate numeric not null check (fee_rate >= 0),
  fee_amount_satang integer not null check (fee_amount_satang >= 0),
  fee_vat_satang integer not null check (fee_vat_satang >= 0),
  net_amount_satang integer not null check (net_amount_satang >= 0),
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  check (amount_satang = fee_amount_satang + fee_vat_satang + net_amount_satang)
);

create unique index if not exists linepay_edc_reports_revenue_date_uidx
  on linepay_edc_reports(revenue_date) where not is_deleted;
create unique index if not exists linepay_edc_reports_settlement_date_uidx
  on linepay_edc_reports(settlement_date) where not is_deleted;
create unique index if not exists linepay_edc_reports_message_uidx
  on linepay_edc_reports(gmail_message_id) where not is_deleted;
create unique index if not exists linepay_edc_reports_hash_uidx
  on linepay_edc_reports(attachment_sha256) where not is_deleted;
create unique index if not exists linepay_edc_transactions_transaction_uidx
  on linepay_edc_transactions(transaction_id) where not is_deleted;
create index if not exists linepay_edc_transactions_report_idx
  on linepay_edc_transactions(report_id) where not is_deleted;

alter table linepay_edc_reports disable row level security;
alter table linepay_edc_transactions disable row level security;
