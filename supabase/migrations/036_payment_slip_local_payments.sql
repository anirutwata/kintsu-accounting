-- Migration 036: record a single real-world bank transfer for a FlowAccount PAY
-- while the accountant is still responsible for posting the combined payment in
-- FlowAccount. The FlowAccount-confirmed state continues to come from synced EXPs.

create table if not exists payment_slip_local_payments (
  id uuid primary key default gen_random_uuid(),
  payment_slip_serial text not null,
  payment_date date not null,
  bank_account_id uuid not null references bank_accounts(id),
  amount_satang bigint not null check (amount_satang > 0),
  slip_image_url text not null,
  note text,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

create unique index if not exists payment_slip_local_payments_active_serial_uidx
  on payment_slip_local_payments(payment_slip_serial)
  where not is_deleted;

create index if not exists payment_slip_local_payments_bank_account_idx
  on payment_slip_local_payments(bank_account_id)
  where not is_deleted;

alter table payment_slip_local_payments disable row level security;
