-- Migration 017: store the customer-entered pre-VAT subtotal directly instead of
-- back-calculating it from the VAT-inclusive total (which could drift a few satang
-- from the real receipt's own subtotal line).
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS subtotal_satang bigint;
