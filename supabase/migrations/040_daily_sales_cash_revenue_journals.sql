-- Track cash revenue JV lifecycle while retaining the existing document identity columns.
alter table daily_sales
  add column if not exists flowaccount_cash_journal_state text not null default 'idle',
  add column if not exists flowaccount_cash_cleanup_record_id integer,
  add column if not exists flowaccount_cash_synced_amount_satang integer,
  add column if not exists flowaccount_cash_sync_error text,
  add column if not exists flowaccount_cash_state_changed_at timestamptz;

alter table daily_sales
  add constraint daily_sales_cash_journal_state_check
  check (flowaccount_cash_journal_state in ('idle','creating','synced','voiding','cleanup_pending','error'));
