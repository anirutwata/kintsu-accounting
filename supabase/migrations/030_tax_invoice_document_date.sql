-- Migration 030: capture the actual date on the customer's bill (วันที่ในบิล) instead of
-- always dating the tax invoice with whatever day staff happened to approve it in Telegram —
-- previously the webhook used getTodayBKK() (the approval date) for every invoice.
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS document_date date;
UPDATE tax_invoice_requests SET document_date = created_at::date WHERE document_date IS NULL;
ALTER TABLE tax_invoice_requests ALTER COLUMN document_date SET DEFAULT CURRENT_DATE;
ALTER TABLE tax_invoice_requests ALTER COLUMN document_date SET NOT NULL;
