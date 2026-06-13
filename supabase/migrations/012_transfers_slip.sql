-- Add slip_image_url to bank_transfers
ALTER TABLE bank_transfers ADD COLUMN IF NOT EXISTS slip_image_url text;
