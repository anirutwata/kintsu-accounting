-- Migration 015: record which payment channel the customer chose on the public tax-invoice-request form
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS payment_method text;
