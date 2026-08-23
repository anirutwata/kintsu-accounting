import type { TaxInvoicePaymentConfig } from '@/lib/flowaccount'

// Resolves settings.default_transfer_bank_account_id (a local bank_accounts row) down to
// the FlowAccount bank account id that resolveTaxInvoicePayment() needs, plus the EDC
// channel id/name — shared by the tax-invoice-request approval flow and the daily-sales
// FlowAccount sync, which both record incoming transfer/card payments the same way.
export async function resolveDefaultPaymentConfig(supabase: any): Promise<TaxInvoicePaymentConfig> {
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('default_transfer_bank_account_id, default_edc_channel_id, default_edc_channel_name')
    .eq('id', 1)
    .maybeSingle()

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
