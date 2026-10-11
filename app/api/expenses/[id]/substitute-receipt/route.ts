import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { SIGNATURE_DATA_URI } from '@/lib/signatureData'
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

  const dateText = esc(thaiDate(exp.date))
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ใบรับรองแทนใบเสร็จรับเงิน</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{margin:0;background:#eceae4;font-family:'Sarabun',sans-serif;font-size:16px;line-height:1.6;color:#1f1f1f}
.page{max-width:794px;margin:16px auto;background:#fff;padding:40px 44px;border-top:6px solid #9d1f14;box-shadow:0 2px 12px rgba(0,0,0,.12)}
.form-no{text-align:right;font-size:13px;color:#777}
h1{text-align:center;font-size:26px;margin:4px 0 2px;color:#9d1f14}
.company{text-align:center;font-weight:600;margin-bottom:20px}
.meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:10px 14px;background:#f6f4ee;border-radius:8px;margin-bottom:16px}
.meta b{color:#555;font-weight:600}
table{width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:15px}
th{background:#9d1f14;color:#fff;font-weight:600;padding:8px 10px;text-align:center}
td{padding:8px 10px;border-bottom:1px solid #ddd;vertical-align:top}
tr.total td{border-top:2px solid #1f1f1f;border-bottom:none;background:#f6f4ee;font-weight:700}
.c{text-align:center}.r{text-align:right;white-space:nowrap}
.cert{text-indent:2.5em;margin:0 0 8px}
.sig{margin:28px 0 0 auto;width:300px;text-align:center}
.sig .img{height:70px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px dotted #555}
.sig .img img{max-height:66px;max-width:100%}
.sig div{margin-top:4px}
.no-print{text-align:center;margin:16px}
.no-print button.back{background:#fff;color:#9d1f14;border:1px solid #9d1f14}
.no-print button{font:inherit;padding:8px 18px;border:0;border-radius:8px;background:#9d1f14;color:#fff;cursor:pointer}
@media print{body{background:#fff}.page{margin:0;box-shadow:none;max-width:none;padding:0;border-top:none}.no-print{display:none}}
@media (max-width:600px){.page{padding:24px 18px;margin:0}table{font-size:14px}}
</style></head><body>
<div class="no-print"><button class="back" onclick="if(history.length>1)history.back();else location.href='/expenses'">← กลับ</button> <button onclick="print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button></div>
<div class="page">
<div class="form-no">แบบ บก.111</div>
<h1>ใบรับรองแทนใบเสร็จรับเงิน</h1>
<div class="company">${esc(COMPANY)}</div>
<div class="meta"><div><b>วันที่:</b> ${dateText}</div>${payee ? `<div><b>จ่ายให้:</b> ${esc(payee)}</div>` : ''}</div>
<table><thead><tr><th style="width:56px">ลำดับ</th><th>รายการ</th><th style="width:130px">จำนวนเงิน (บาท)</th><th style="width:110px">หมายเหตุ</th></tr></thead><tbody>
${rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.text || '-')}</td><td class="r">${baht(r.satang)}</td><td></td></tr>`).join('')}
${exp.discount_satang ? `<tr><td></td><td>ส่วนลด</td><td class="r">-${baht(exp.discount_satang)}</td><td></td></tr>` : ''}
${exp.vat_satang && !exp.vat_inclusive ? `<tr><td></td><td>ภาษีมูลค่าเพิ่ม</td><td class="r">${baht(exp.vat_satang)}</td><td></td></tr>` : ''}
<tr class="total"><td colspan="2" class="r">รวมเงิน (${esc(bahtText(total))})</td><td class="r">${baht(total)}</td><td></td></tr>
</tbody></table>
<p class="cert">ข้าพเจ้า ${esc(CERTIFIER_NAME)}${CERTIFIER_POSITION ? ` ตำแหน่ง ${esc(CERTIFIER_POSITION)}` : ''} ${esc(COMPANY)}
ขอรับรองว่ารายจ่ายข้างต้นนี้ ไม่อาจเรียกใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในกิจการของบริษัทโดยแท้</p>
<div class="sig">
<div class="img">${SIGNATURE_DATA_URI ? `<img src="${SIGNATURE_DATA_URI}" alt="ลายเซ็น">` : ''}</div>
<div>(${esc(CERTIFIER_NAME)})</div>
<div>${esc(CERTIFIER_POSITION)} · ผู้รับรอง</div>
<div>วันที่ ${dateText}</div>
</div>
</div></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
