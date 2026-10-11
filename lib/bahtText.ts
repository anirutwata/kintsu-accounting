const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

function readBelowMillion(n: number, hasHigher = false): string {
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i])
    const pos = s.length - 1 - i
    if (d === 0) continue
    if (pos === 1 && d === 1) out += 'สิบ'
    else if (pos === 1 && d === 2) out += 'ยี่สิบ'
    else if (pos === 0 && d === 1 && (s.length > 1 || hasHigher)) out += 'เอ็ด'
    else out += DIGITS[d] + UNITS[pos]
  }
  return out
}

function readInt(n: number): string {
  if (n === 0) return DIGITS[0]
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  return (millions ? readInt(millions) + 'ล้าน' : '') + (rest ? readBelowMillion(rest, millions > 0) : '')
}

export function bahtText(satang: number): string {
  const baht = Math.floor(satang / 100)
  const sa = satang % 100
  return readInt(baht) + 'บาท' + (sa ? readBelowMillion(sa) + 'สตางค์' : 'ถ้วน')
}
