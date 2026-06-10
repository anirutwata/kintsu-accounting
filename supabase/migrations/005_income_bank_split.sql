-- Split income bank account settings per POS channel and payment method
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS fs_promptpay_bank_id         uuid REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS fs_company_transfer_bank_id  uuid REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS fs_credit_card_bank_id       uuid REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS pp_promptpay_bank_id         uuid REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS pp_company_transfer_bank_id  uuid REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS pp_credit_card_bank_id       uuid REFERENCES bank_accounts(id);
-- grab_bank_account_id already exists from migration 004
