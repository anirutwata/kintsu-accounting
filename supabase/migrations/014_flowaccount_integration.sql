-- Migration 014: FlowAccount OpenAPI integration
-- 1) expense_categories → map each category to its FlowAccount business expense category
-- 2) expenses / daily_sales → track whether/where a record was pushed to FlowAccount
-- 3) tax_invoice_requests → public "ขอใบกำกับภาษี" form submissions

-- 1) Category mapping
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS flowaccount_category_id integer;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS flowaccount_system_code integer;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS flowaccount_credit_id integer;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS flowaccount_credit_category integer;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS flowaccount_debit_id integer;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS flowaccount_debit_category integer;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS flowaccount_category_name text;

-- 2) Sync tracking on expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS flowaccount_record_id integer;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS flowaccount_document_serial text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS flowaccount_synced_at timestamptz;

-- Sync tracking on daily_sales (one cash invoice per day)
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_record_id integer;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_document_serial text;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS flowaccount_synced_at timestamptz;

-- 3) Public tax-invoice request form submissions
CREATE TABLE IF NOT EXISTS tax_invoice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name text NOT NULL,
  contact_tax_id text,
  contact_address text,
  contact_branch text,
  contact_email text NOT NULL,
  description text NOT NULL,
  total_satang bigint NOT NULL, -- ยอดรวม VAT ที่ลูกค้ากรอก (ย้อนคำนวณ VAT 7% จากยอดนี้)
  status text NOT NULL DEFAULT 'pending', -- pending | created | emailed | failed
  flowaccount_record_id integer,
  flowaccount_document_serial text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  emailed_at timestamptz
);

CREATE INDEX IF NOT EXISTS tax_invoice_requests_created_at_idx ON tax_invoice_requests(created_at DESC);

-- Same access model as the rest of this app: no Supabase Auth session, app-level PIN
-- auth handles the authenticated side; writes to this table happen through the
-- server-side API route (not directly from the public form), consistent with how
-- every other table here is already reachable via the anon key.
ALTER TABLE tax_invoice_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON tax_invoice_requests FOR ALL USING (true) WITH CHECK (true);
