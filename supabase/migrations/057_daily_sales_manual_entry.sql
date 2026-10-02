-- Migration 057: record when a person entered a day's revenue.
-- daily_sales rows are also created by the TTB PromptPay / LINE Pay EDC imports, so the
-- row existing doesn't mean staff entered the day. The sales API now refuses to save a
-- day while an earlier day (from 2026-10-01, lib/dailySalesLock.ts) has no
-- manual_entered_at, and a morning cron alerts Telegram about missing days.
alter table daily_sales add column if not exists manual_entered_at timestamptz;
alter table daily_sales add column if not exists manual_entered_by_name text;

-- Backfill days already entered since the lock start. Only POST /api/sales writes
-- total_gross_satang (the imports never touch it), so a non-zero total means staff
-- saved the day. A day saved as all zeros before this migration isn't detectable and
-- must be saved again — the app then shows it as missing, which is the safe side.
update daily_sales
set manual_entered_at = updated_at
where date >= '2026-10-01'
  and manual_entered_at is null
  and total_gross_satang > 0;
