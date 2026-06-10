ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS income_bank_account_id uuid REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS grab_bank_account_id   uuid REFERENCES bank_accounts(id);
