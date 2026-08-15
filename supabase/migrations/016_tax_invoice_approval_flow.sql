-- Migration 016: require a bill photo on the public tax-invoice-request form and
-- gate document creation behind staff approval in Telegram before anything is
-- issued in FlowAccount or emailed to the customer.

ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS bill_image_url text;
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS rejection_reason text;
-- Telegram message that carries the Approve/Reject buttons, so the webhook can edit it later
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS telegram_message_id bigint;

-- status values now: pending_review | rejected | created | emailed | failed
