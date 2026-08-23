-- Migration 031: let staff configure the bank account / EDC channel used to record
-- incoming transfer and card payments in FlowAccount from Settings > ระบบ, with a live
-- dropdown pulled from FlowAccount itself — previously only configurable via Vercel env
-- vars (FLOWACCOUNT_BANK_ACCOUNT_ID / FLOWACCOUNT_EDC_CHANNEL_ID), which needed a redeploy
-- to change and had no UI at all. Shared by both the tax-invoice-request approval flow and
-- the daily-sales FlowAccount sync — they already used the same env vars for this.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_transfer_bank_account_id uuid REFERENCES bank_accounts(id);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_edc_channel_id integer;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_edc_channel_name text;

-- save_settings() lists columns explicitly (see migration 007) — re-create it with the
-- three new columns included, or PUT /api/settings would silently drop them.
CREATE OR REPLACE FUNCTION save_settings(settings_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  UPDATE settings SET
    restaurant_name                  = COALESCE(settings_data->>'restaurant_name', restaurant_name),
    vat_rate_bps                     = COALESCE((settings_data->>'vat_rate_bps')::integer, vat_rate_bps),
    service_charge_bps               = COALESCE((settings_data->>'service_charge_bps')::integer, service_charge_bps),
    grabfood_gp_bps                  = COALESCE((settings_data->>'grabfood_gp_bps')::integer, grabfood_gp_bps),
    telegram_bot_token                = settings_data->>'telegram_bot_token',
    telegram_chat_id                  = settings_data->>'telegram_chat_id',
    grab_bank_account_id              = (settings_data->>'grab_bank_account_id')::uuid,
    fs_promptpay_bank_id              = (settings_data->>'fs_promptpay_bank_id')::uuid,
    fs_company_transfer_bank_id       = (settings_data->>'fs_company_transfer_bank_id')::uuid,
    fs_credit_card_bank_id            = (settings_data->>'fs_credit_card_bank_id')::uuid,
    pp_promptpay_bank_id              = (settings_data->>'pp_promptpay_bank_id')::uuid,
    pp_company_transfer_bank_id       = (settings_data->>'pp_company_transfer_bank_id')::uuid,
    pp_credit_card_bank_id            = (settings_data->>'pp_credit_card_bank_id')::uuid,
    default_transfer_bank_account_id  = (settings_data->>'default_transfer_bank_account_id')::uuid,
    default_edc_channel_id            = (settings_data->>'default_edc_channel_id')::integer,
    default_edc_channel_name          = settings_data->>'default_edc_channel_name',
    updated_at                        = now()
  WHERE id = 1;

  SELECT to_jsonb(s) INTO result FROM settings s WHERE id = 1;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION save_settings(jsonb) TO anon, authenticated;
