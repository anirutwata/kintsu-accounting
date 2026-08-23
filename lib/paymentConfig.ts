import type { TaxInvoicePaymentConfig } from '@/lib/flowaccount'

// Resolves settings.default_transfer_bank_account_id (a local bank_accounts row) down to
// the FlowAccount bank account id that resolveTaxInvoicePayment() needs, plus the EDC
// channel id/name — shared by the tax-invoice-request approval flow and the daily-sales
// FlowAccount sync, which both record incoming transfer/card payments the same way.
export async function resolveDefaultPaymentConfig(supabase: any): Promise<TaxInvoicePaymentConfig> {
  // A plain .from('settings').select() can silently miss UUID FK columns added via
  // ALTER TABLE (PostgREST doesn't always pick them up) — get_settings() is the
  // SECURITY DEFINER RPC migration 007 built specifically to work around that; reuse it
  // instead of querying the table directly.
  const { data: settingsRow } = await supabase.rpc('get_settings')

  let bankAccountId: number | undefined
  if (settingsRow?.default_transfer_bank_account_id) {
    const { data: bank } = await supabase
      .from('bank_accounts')
      .select('flowaccount_bank_account_id')
      .eq('id', settingsRow.default_transfer_bank_account_id)
      .maybeSingle()
    bankAccountId = bank?.flowaccount_bank_account_id ?? undefined
  }

  return {
    bankAccountId,
    edcChannelId: settingsRow?.default_edc_channel_id ?? undefined,
    edcChannelName: settingsRow?.default_edc_channel_name ?? undefined,
  }
}
