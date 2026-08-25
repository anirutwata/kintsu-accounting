-- Preserve the remote FlowAccount identity when compensating cleanup cannot finish.
alter table ttb_promptpay_reports
  drop constraint if exists ttb_promptpay_reports_sync_state_check;

alter table ttb_promptpay_reports
  add constraint ttb_promptpay_reports_sync_state_check
  check (sync_state in ('idle','creating','synced','error','cleanup_pending'));
