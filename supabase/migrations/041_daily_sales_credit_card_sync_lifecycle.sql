-- Make the retained credit-card Cash Sale path idempotent and recoverable.
alter table daily_sales
  add column if not exists flowaccount_credit_card_sync_state text not null default 'idle',
  add column if not exists flowaccount_credit_card_cleanup_record_id integer,
  add column if not exists flowaccount_credit_card_synced_amount_satang integer,
  add column if not exists flowaccount_credit_card_sync_error text;

alter table daily_sales
  add constraint daily_sales_credit_card_sync_state_check
  check (flowaccount_credit_card_sync_state in ('idle','creating','synced','cleanup_pending','error'));

update daily_sales
set flowaccount_credit_card_sync_state = 'synced'
where flowaccount_credit_card_record_id is not null;
