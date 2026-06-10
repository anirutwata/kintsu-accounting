-- RPC functions for settings that bypass PostgREST column-level restrictions
-- SECURITY DEFINER runs as postgres superuser, exposing all columns including
-- UUID FK columns added via ALTER TABLE (which anon role may not see via PostgREST)

CREATE OR REPLACE FUNCTION get_settings()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(s) FROM settings s WHERE id = 1;
$$;

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
    restaurant_name              = COALESCE(settings_data->>'restaurant_name', restaurant_name),
    vat_rate_bps                 = COALESCE((settings_data->>'vat_rate_bps')::integer, vat_rate_bps),
    service_charge_bps           = COALESCE((settings_data->>'service_charge_bps')::integer, service_charge_bps),
    grabfood_gp_bps              = COALESCE((settings_data->>'grabfood_gp_bps')::integer, grabfood_gp_bps),
    telegram_bot_token           = settings_data->>'telegram_bot_token',
    telegram_chat_id             = settings_data->>'telegram_chat_id',
    grab_bank_account_id         = (settings_data->>'grab_bank_account_id')::uuid,
    fs_promptpay_bank_id         = (settings_data->>'fs_promptpay_bank_id')::uuid,
    fs_company_transfer_bank_id  = (settings_data->>'fs_company_transfer_bank_id')::uuid,
    fs_credit_card_bank_id       = (settings_data->>'fs_credit_card_bank_id')::uuid,
    pp_promptpay_bank_id         = (settings_data->>'pp_promptpay_bank_id')::uuid,
    pp_company_transfer_bank_id  = (settings_data->>'pp_company_transfer_bank_id')::uuid,
    pp_credit_card_bank_id       = (settings_data->>'pp_credit_card_bank_id')::uuid,
    updated_at                   = now()
  WHERE id = 1;

  SELECT to_jsonb(s) INTO result FROM settings s WHERE id = 1;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_settings(jsonb) TO anon, authenticated;
