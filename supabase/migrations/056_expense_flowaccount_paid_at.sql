-- Migration 056: defer FlowAccount payment confirmation to a manual step.
-- Expenses synced to FlowAccount now stay "รอดำเนินการ (Awaiting)" there instead of
-- being marked paid automatically right after creation — FlowAccount only allows PUT
-- edits on an awaiting document, so auto-paying it immediately locked out any later
-- correction (see lib/expenseSync.ts). Staff now confirm payment explicitly via the
-- "ชำระเงิน" button once they're sure the details are right; flowaccount_paid_at
-- records when that happened.
alter table expenses add column if not exists flowaccount_paid_at timestamptz;

-- Backfill: every expense already synced to FlowAccount under the OLD code was auto-paid
-- right after creation (see git history of lib/expenseSync.ts) unless that specific
-- payment step failed and alerted staff via Telegram — those failures are rare and,
-- being alerted at the time, staff already know to fix them directly in FlowAccount.
-- Without this backfill every already-paid historical expense would wrongly show
-- "รอดำเนินการ (ยังไม่ชำระ)" in the app, and pressing the new "ชำระเงิน" button on one
-- would hit FlowAccount's "already paid" error — the same kind of confusing failure this
-- change exists to prevent. Getting this backfill wrong only hides the button on a
-- genuinely-still-awaiting row (a minor cosmetic miss, not a data-safety issue) — it
-- never affects the real FlowAccount document, since flowaccount_paid_at only gates the
-- app's own UI/API, not FlowAccount's actual state.
update expenses
set flowaccount_paid_at = coalesce(flowaccount_synced_at, now())
where flowaccount_record_id is not null
  and flowaccount_paid_at is null;
