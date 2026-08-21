-- Optional manual override for the vendor's address on the expense form, for the
-- cases findContact() (existing FlowAccount contact) and the receipt-photo OCR
-- fallback can't cover — a genuinely new vendor with no bill photo attached.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recipient_address text;
