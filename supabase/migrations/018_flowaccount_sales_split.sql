-- Migration 018: sync daily sales to FlowAccount as up to 3 separate cash invoices
-- (one per payment channel: cash / bank transfer+promptpay / credit card EDC) instead of
-- one lump-sum document with no payment method — the old single-document sync silently
-- defaulted everything to "cash" in FlowAccount regardless of how it was actually collected.
ALTER TABLE daily_sales DROP COLUMN IF EXISTS flowaccount_record_id;
ALTER TABLE daily_sales DROP COLUMN IF EXISTS flowaccount_document_serial;
ALTER TABLE daily_sales DROP COLUMN IF EXISTS flowaccount_synced_at;

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_cash_record_id integer;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_cash_document_serial text;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_cash_synced_at timestamptz;

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_transfer_record_id integer;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_transfer_document_serial text;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_transfer_synced_at timestamptz;

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_credit_card_record_id integer;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_credit_card_document_serial text;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_credit_card_synced_at timestamptz;
