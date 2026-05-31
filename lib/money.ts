// All monetary values stored and calculated as integers (สตางค์)
// ฿100.50 = 10050 satang — never use float for money

export const toSatang = (baht: number): number => Math.round(baht * 100)
export const toBaht = (satang: number): number => satang / 100

// Format a satang value as plain number with commas for input fields (no currency symbol)
// e.g. 100050 → "1,000.50"
export function fmtInput(satang: number): string {
  return (satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Strip commas before parseFloat
export function parseInput(val: string): number {
  return parseFloat(val.replace(/,/g, '')) || 0
}

export function formatBaht(satang: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(satang / 100)
}

export function formatBahtShort(satang: number): string {
  const baht = satang / 100
  if (baht >= 1_000_000) return `฿${(baht / 1_000_000).toFixed(1)}M`
  if (baht >= 1_000) return `฿${(baht / 1_000).toFixed(1)}K`
  return `฿${baht.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`
}

// Basis points: 3200 = 32.00%
export function bpsToPct(bps: number): number {
  return bps / 100
}

export function formatPct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

export function calcBps(part: number, total: number): number {
  if (total === 0) return 0
  return Math.round((part / total) * 10000)
}

// VAT exclusive: price does NOT include VAT
// Kintsu: food price + 10% SC + 7% VAT (on food only, not SC)
export function calculateVAT(amountSatang: number, vatBps = 700, scBps = 1000) {
  const vatSatang = Math.round(amountSatang * vatBps / 10000)
  const serviceChargeSatang = Math.round(amountSatang * scBps / 10000)
  return {
    netSatang: amountSatang,
    serviceChargeSatang,
    vatSatang,
    totalSatang: amountSatang + serviceChargeSatang + vatSatang,
  }
}

// GrabFood: gross revenue - GP fee = net revenue
export function calcGrabNet(grossSatang: number, gpBps = 3000): {
  gpFeeSatang: number
  netSatang: number
} {
  const gpFeeSatang = Math.round(grossSatang * gpBps / 10000)
  return { gpFeeSatang, netSatang: grossSatang - gpFeeSatang }
}

// Denomination counting for shift close
export function countDenominations(denoms: Record<string, number>): number {
  return Object.entries(denoms).reduce((sum, [denom, count]) => {
    return sum + parseInt(denom) * count
  }, 0)
}

export const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100] // in satang
export const DENOM_LABELS: Record<number, string> = {
  100000: '฿1,000',
  50000:  '฿500',
  20000:  '฿200',
  10000:  '฿100',
  5000:   '฿50',
  2000:   '฿20',
  1000:   '฿10',
  500:    '฿5',
  100:    '฿1',
}
