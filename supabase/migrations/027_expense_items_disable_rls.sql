-- expense_items defaulted to RLS-enabled-with-no-policies (Supabase's platform
-- default), which silently denied every insert — this project disables RLS on
-- almost every table instead, relying on app-layer role checks (see 001_schema.sql's
-- "same pattern as other KINTSU projects" block). Missed in migration 026.
alter table expense_items disable row level security;
