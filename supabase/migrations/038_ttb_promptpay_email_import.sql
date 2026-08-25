-- Import the authoritative daily TTB Smart Shop PromptPay report from Gmail.
alter table settings
  add column if not exists ttb_promptpay_bank_account_id uuid references bank_accounts(id);

alter table daily_sales
  add column if not exists ttb_promptpay_satang integer not null default 0,
  add column if not exists ttb_promptpay_report_id uuid;

create table if not exists ttb_promptpay_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  gmail_message_id text not null,
  attachment_sha256 text not null,
  attachment_name text not null,
  merchant_id text not null,
  successful_count integer not null,
  successful_amount_satang integer not null,
  voided_count integer not null default 0,
  voided_amount_satang integer not null default 0,
  bank_account_id uuid not null references bank_accounts(id),
  flowaccount_record_id integer,
  flowaccount_document_serial text,
  flowaccount_synced_at timestamptz,
  sync_state text not null default 'idle' check (sync_state in ('idle','creating','synced','error')),
  sync_error text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

alter table daily_sales
  add constraint daily_sales_ttb_promptpay_report_fk
  foreign key (ttb_promptpay_report_id) references ttb_promptpay_reports(id);

create table if not exists ttb_promptpay_transactions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ttb_promptpay_reports(id),
  bank_reference text not null,
  payment_date date not null,
  payment_time time not null,
  amount_satang integer not null check (amount_satang > 0),
  status text not null,
  payment_channel text,
  payer_bank text,
  payer_name text,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

create index if not exists ttb_promptpay_transactions_report_idx
  on ttb_promptpay_transactions(report_id) where not is_deleted;
create unique index if not exists ttb_promptpay_reports_date_uidx
  on ttb_promptpay_reports(report_date) where not is_deleted;
create unique index if not exists ttb_promptpay_reports_message_uidx
  on ttb_promptpay_reports(gmail_message_id) where not is_deleted;
create unique index if not exists ttb_promptpay_reports_hash_uidx
  on ttb_promptpay_reports(attachment_sha256) where not is_deleted;
create unique index if not exists ttb_promptpay_transactions_ref_uidx
  on ttb_promptpay_transactions(bank_reference) where not is_deleted;

alter table ttb_promptpay_reports disable row level security;
alter table ttb_promptpay_transactions disable row level security;

create or replace function save_settings(settings_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  update settings set
    restaurant_name                  = coalesce(settings_data->>'restaurant_name', restaurant_name),
    vat_rate_bps                     = coalesce((settings_data->>'vat_rate_bps')::integer, vat_rate_bps),
    service_charge_bps               = coalesce((settings_data->>'service_charge_bps')::integer, service_charge_bps),
    grabfood_gp_bps                  = coalesce((settings_data->>'grabfood_gp_bps')::integer, grabfood_gp_bps),
    telegram_bot_token               = settings_data->>'telegram_bot_token',
    telegram_chat_id                 = settings_data->>'telegram_chat_id',
    grab_bank_account_id             = (settings_data->>'grab_bank_account_id')::uuid,
    fs_promptpay_bank_id             = (settings_data->>'fs_promptpay_bank_id')::uuid,
    fs_company_transfer_bank_id      = (settings_data->>'fs_company_transfer_bank_id')::uuid,
    fs_credit_card_bank_id           = (settings_data->>'fs_credit_card_bank_id')::uuid,
    pp_promptpay_bank_id             = (settings_data->>'pp_promptpay_bank_id')::uuid,
    pp_company_transfer_bank_id      = (settings_data->>'pp_company_transfer_bank_id')::uuid,
    pp_credit_card_bank_id           = (settings_data->>'pp_credit_card_bank_id')::uuid,
    default_transfer_bank_account_id = (settings_data->>'default_transfer_bank_account_id')::uuid,
    default_edc_channel_id           = (settings_data->>'default_edc_channel_id')::integer,
    default_edc_channel_name         = settings_data->>'default_edc_channel_name',
    ttb_promptpay_bank_account_id    = (settings_data->>'ttb_promptpay_bank_account_id')::uuid,
    updated_at                       = now()
  where id = 1;
  select to_jsonb(s) into result from settings s where id = 1;
  return result;
end;
$$;
