export const LINEPAY_EDC_POLICY = {
  merchantId: '59IlGmY3YE2dsy1aUflYJI8WDrpyoA',
  merchantNameIncludes: ['คินสึ ยากินิคุ', 'เซ็นทรัล ขอนแก่น แคมปัส'],
  // The physical EDC device's label in FlowAccount's chart of accounts is keyed to this
  // ID. LINE Pay's own daily settlement report uses a *different* terminal_id per card
  // scheme on this same device (e.g. JCB reports under a different ID than Visa/
  // Mastercard) — that field varies with the customer's card, not the device, so it is
  // not validated against this value; only merchantId/merchantNameIncludes below are.
  terminalId: '88122653',
  bankAccountNumber: '1608755558',
  accountCodes: {
    bank: '11121.01',
    edcClearing: '11379.01',
    fee: '53212',
    pendingVat: '17115',
    revenue: '41210',
  },
} as const
