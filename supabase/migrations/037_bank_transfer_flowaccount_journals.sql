-- Migration 037: sync KINTSU bank transfers to approved FlowAccount Journal
-- Vouchers (JV). Preserve local rows for audit and retain the remote identity so
-- retries are idempotent and edits/deletes can void the original JV first.

alter table bank_accounts
  add column if not exists flowaccount_chart_of_account_id bigint;

alter table bank_transfers
  add column if not exists flowaccount_journal_record_id bigint,
  add column if not exists flowaccount_journal_serial text,
  add column if not exists flowaccount_journal_state text not null default 'idle'
    check (flowaccount_journal_state in ('idle', 'creating', 'synced', 'voiding', 'void_pending', 'error')),
  add column if not exists flowaccount_synced_at timestamptz,
  add column if not exists flowaccount_sync_error text,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table bank_transfers
  drop constraint if exists bank_transfers_flowaccount_journal_state_check;
alter table bank_transfers
  add constraint bank_transfers_flowaccount_journal_state_check
  check (flowaccount_journal_state in ('idle', 'creating', 'synced', 'voiding', 'void_pending', 'error'));

update bank_transfers
set flowaccount_journal_state = 'synced'
where flowaccount_journal_record_id is not null
  and flowaccount_journal_state = 'idle';

create unique index if not exists bank_transfers_flowaccount_journal_uidx
  on bank_transfers(flowaccount_journal_record_id)
  where flowaccount_journal_record_id is not null;

create index if not exists bank_transfers_active_date_idx
  on bank_transfers(date desc)
  where not is_deleted;

-- Production mappings verified from FlowAccount's live chart of accounts on
-- 2026-08-24. Future accounts must be mapped from Settings > บัญชีธนาคาร.
update bank_accounts set flowaccount_chart_of_account_id = case account_number
  when '160-8-75555-8' then 215527573 -- 11121.01 กสิกรไทย 1608755558
  when '760-2-31598-3' then 449281559 -- 11122.07 ทหารไทยธนชาต 7602315983
  when '039-1-72208-0' then 433572299 -- 11122.04 กสิกรไทย 0391722080
  when '112-8-45582-1' then 447242370 -- 11122.05 กสิกรไทย 1128455821
  when '375-3-48850-0' then 447594912 -- 11122.06 ยูโอบี 3753488500
  else flowaccount_chart_of_account_id
end;
