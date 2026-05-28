-- Migration 003: Bank Accounts + Expense extra fields

-- ─── Bank Accounts (our company bank accounts used for payments) ─────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,          -- e.g. 'KBANK', 'SCB', 'KTB'
  account_number text NOT NULL,     -- e.g. '123-4-56789-0'
  account_name text NOT NULL,       -- account holder name
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bank_accounts DISABLE ROW LEVEL SECURITY;

-- ─── Add extra columns to expenses ───────────────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS transfer_time text,         -- e.g. '14:30' from OCR
  ADD COLUMN IF NOT EXISTS sender_name text,           -- ชื่อผู้โอน (from OCR)
  ADD COLUMN IF NOT EXISTS sender_bank text,           -- ธนาคารผู้โอน (from OCR)
  ADD COLUMN IF NOT EXISTS sender_account text,        -- เลขบัญชีผู้โอน (from OCR)
  ADD COLUMN IF NOT EXISTS recipient_name text,        -- ชื่อผู้รับ (from OCR)
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS receipt_image_urls text[] DEFAULT '{}';

-- ─── Create receipts storage bucket (run in Supabase Storage UI or SQL) ──────
-- INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true)
-- ON CONFLICT DO NOTHING;
