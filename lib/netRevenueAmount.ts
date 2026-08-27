export function netRevenueAmountSatang(authoritativeSatang: number, fullTaxInvoiceSatang: number): number {
  const amount = Number(authoritativeSatang || 0) - Number(fullTaxInvoiceSatang || 0)
  if (amount < 0) throw new Error('ยอดใบกำกับภาษีเต็มรูปเกินยอดรายได้ authoritative')
  return amount
}
