-- Migration 034: import FlowAccount EXP documents paid through PAY payment slips.
-- One PAY may settle many EXP documents; expenses remain one row per EXP while
-- flowaccount_payment_slip_serial provides the grouping key for the single bank payment.

alter table expenses
  add column if not exists source text not null default 'kintsu',
  add column if not exists flowaccount_payment_slip_serial text,
  add column if not exists flowaccount_payment_status text,
  add column if not exists flowaccount_payment_channel text,
  add column if not exists flowaccount_reference text;

create unique index if not exists expenses_flowaccount_record_id_uidx
  on expenses(flowaccount_record_id);

create index if not exists expenses_flowaccount_payment_slip_idx
  on expenses(flowaccount_payment_slip_serial)
  where flowaccount_payment_slip_serial is not null and not is_deleted;

create unique index if not exists expense_items_expense_sort_order_uidx
  on expense_items(expense_id, sort_order);
