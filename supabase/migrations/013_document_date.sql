-- Migration 013: Add document_date (วันที่เอกสาร/ใบแจ้งหนี้) to expenses
-- Separates P&L date (document_date) from payment date (date)
-- document_date = วันที่บิล/ใบแจ้งหนี้ → ใช้คำนวณ P&L ของเดือน
-- date          = วันที่ชำระเงินจริง       → ใช้กระทบยอดธนาคาร

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS document_date date;

-- Backfill: existing records use payment date as document date
UPDATE expenses SET document_date = date WHERE document_date IS NULL;

-- Set default and not-null constraint (must be separate statements in PostgreSQL)
ALTER TABLE expenses ALTER COLUMN document_date SET DEFAULT CURRENT_DATE;
ALTER TABLE expenses ALTER COLUMN document_date SET NOT NULL;

-- Index for month-based P&L queries
CREATE INDEX IF NOT EXISTS expenses_document_date_idx ON expenses(document_date DESC) WHERE NOT is_deleted;
