export const LINEPAY_EDC_POLICY = {
  merchantId: '59IlGmY3YE2dsy1aUflYJI8WDrpyoA',
  merchantNameIncludes: ['คินสึ ยากินิคุ', 'เซ็นทรัล ขอนแก่น แคมปัส'],
  // The single physical EDC device at the store reports under this terminal ID for
  // Visa/Mastercard/UnionPay — that's what its label in FlowAccount's chart of accounts
  // is keyed to. JCB acquiring runs through a separate sub-terminal ID on LINE Pay's own
  // settlement report even though it's the same physical machine (JCB registration is
  // handled through a different acquiring path in Thailand) — accepted as a second known
  // terminal ID, not a second device.
  terminalId: '88122653',
  jcbTerminalId: '19912876',
  bankAccountNumber: '1608755558',
  accountCodes: {
    bank: '11121.01',
    edcClearing: '11379.01',
    fee: '53212',
    pendingVat: '17115',
    revenue: '41210',
  },
} as const
