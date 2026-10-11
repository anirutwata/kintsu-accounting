import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { bahtText } from '@/lib/bahtText'
import { THAI_MONTHS, BUDDHIST_ERA_OFFSET, parseIsoDate } from '@/lib/thaiDate'

const COMPANY = 'บริษัท คิวโซลา จำกัด'
const CERTIFIER_NAME = 'อนิรุจน์ วทานิโยบล'
const CERTIFIER_POSITION = 'กรรมการผู้จัดการ'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const baht = (satang: number) => (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })
const thaiDate = (iso: string) => {
  const { year, month, day } = parseIsoDate(iso)
  return `${day} ${THAI_MONTHS[month - 1]} ${year + BUDDHIST_ERA_OFFSET}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  if (!cookieStore.get('kintsu_acc_user_id')?.value) return new Response('กรุณาเข้าสู่ระบบ', { status: 401 })
  const { id } = await params
  const supabase = await createClient()
  const { data: exp } = await supabase.from('expenses').select('*').eq('id', id).eq('is_deleted', false).maybeSingle()
  if (!exp) return new Response('ไม่พบรายการ', { status: 404 })
  const { data: items } = await supabase.from('expense_items').select('description,total_satang').eq('expense_id', id).eq('is_deleted', false).order('sort_order')

  const rows = items?.length
    ? items.map((i) => ({ text: i.description, satang: i.total_satang as number }))
    : [{ text: [exp.category, exp.note].filter(Boolean).join(' — '), satang: exp.amount_satang as number }]
  const total = exp.total_satang as number
  const payee = [exp.recipient_name, exp.recipient_address].filter(Boolean).join(' ')

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบรับรองแทนใบเสร็จรับเงิน</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>
body{font-family:'Sarabun',sans-serif;font-size:16px;max-width:720px;margin:24px auto;padding:0 16px;color:#000}
h1{text-align:center;font-size:22px;margin:0 0 4px}.c{text-align:center}.r{text-align:right}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #000;padding:6px 8px;vertical-align:top}
.sig{margin-top:48px;text-align:center;width:50%;margin-left:50%}
.no-print{margin-bottom:16px}@media print{.no-print{display:none}}
</style></head><body>
<div class="no-print"><button onclick="print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button></div>
<h1>ใบรับรองแทนใบเสร็จรับเงิน</h1>
<p class="c">${esc(COMPANY)}</p>
<p>วันที่ ${esc(thaiDate(exp.date))}${payee ? `<br>จ่ายให้: ${esc(payee)}` : ''}</p>
<table><thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวนเงิน (บาท)</th><th>หมายเหตุ</th></tr></thead><tbody>
${rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.text || '-')}</td><td class="r">${baht(r.satang)}</td><td></td></tr>`).join('')}
${exp.discount_satang ? `<tr><td></td><td>ส่วนลด</td><td class="r">-${baht(exp.discount_satang)}</td><td></td></tr>` : ''}
${exp.vat_satang && !exp.vat_inclusive ? `<tr><td></td><td>ภาษีมูลค่าเพิ่ม</td><td class="r">${baht(exp.vat_satang)}</td><td></td></tr>` : ''}
<tr><td colspan="2" class="r"><b>รวมเงิน</b> (${esc(bahtText(total))})</td><td class="r"><b>${baht(total)}</b></td><td></td></tr>
</tbody></table>
<p>ข้าพเจ้า ${esc(CERTIFIER_NAME)}${CERTIFIER_POSITION ? ` ตำแหน่ง ${esc(CERTIFIER_POSITION)}` : ''} ${esc(COMPANY)}
ขอรับรองว่ารายจ่ายข้างต้นนี้ ไม่อาจเรียกใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในกิจการของบริษัทโดยแท้</p>
<div class="sig">ลงชื่อ ................................................ ผู้รับรอง<br>(${esc(CERTIFIER_NAME)})<br>วันที่ ........ / ........ / ........</div>
</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
