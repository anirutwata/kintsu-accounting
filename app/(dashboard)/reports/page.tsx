'use client'
import { useState, useEffect } from 'react'
import { formatBaht, formatPct } from '@/lib/money'
import { getMonthKey, formatThaiMonth } from '@/lib/utils'
import type { KPIResult } from '@/types'

export default function ReportsPage() {
  const [month, setMonth] = useState(getMonthKey())
  const [kpi, setKpi] = useState<KPIResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showGAS, setShowGAS] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/integrations/kpi?month=${month}`)
      setKpi(await res.json())
      setLoading(false)
    }
    load()
  }, [month])

  async function handleExportCSV() {
    setExporting(true)
    const key = process.env.NEXT_PUBLIC_EXPORT_API_KEY || ''
    const url = `/api/export?month=${month}&type=csv&key=${key}`
    const res = await fetch(url)
    if (res.ok) {
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `kintsu-${month}.csv`
      a.click()
    } else {
      alert('Export ไม่สำเร็จ กรุณาตั้งค่า EXPORT_API_KEY ใน Vercel')
    }
    setExporting(false)
  }

  async function sendTelegramSummary() {
    if (!kpi) return
    setSending(true)
    await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'daily_summary',
        data: {
          date: formatThaiMonth(month),
          totalRevenue: kpi.totalRevenueSatang,
          foodCostBps: kpi.foodCostBps,
          laborCostBps: kpi.laborCostBps,
          netProfitSatang: kpi.netProfitSatang,
          netProfitBps: kpi.netProfitBps,
          overdueSuppliers: 0,
        },
      }),
    })
    setSending(false)
    alert('ส่ง Telegram แล้ว!')
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>รายงาน P&L</h1>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1.5" style={{ borderColor: 'var(--border)', background: 'white' }}>
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
            return <option key={key} value={key}>{formatThaiMonth(key)}</option>
          })}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : kpi ? (
        <>
          {/* P&L Table */}
          <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              <h3 className="font-semibold text-sm">งบกำไร-ขาดทุน — {formatThaiMonth(month)}</h3>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              <PLRow label="รายได้สุทธิ" value={kpi.totalRevenueSatang} type="income" />
              <PLRow label="Food Cost" pct={kpi.foodCostBps} value={-kpi.foodCostSatang} type="expense"
                badge={kpi.foodCostSource === 'kintsu_stock' ? 'Stock' : undefined} />
              <PLRow label="Labor Cost" pct={kpi.laborCostBps} value={-kpi.laborCostSatang} type="expense"
                badge={kpi.laborCostSource === 'kintsu_hr' ? 'HR' : undefined} />
              <PLRow label="Grab GP Fee" value={-kpi.grabGpCostSatang} type="expense" />
              <PLRow label="ค่าใช้จ่ายอื่นๆ" value={-kpi.otherExpensesSatang} type="expense" />
              <PLRow label="รวมค่าใช้จ่าย" value={-kpi.totalExpensesSatang} type="subtotal" />
              <PLRow label="กำไรสุทธิ" pct={kpi.netProfitBps} value={kpi.netProfitSatang}
                type={kpi.netProfitSatang >= 0 ? 'profit' : 'loss'} />
            </div>
          </div>

          {/* VAT Section */}
          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--charcoal)' }}>ภาษีมูลค่าเพิ่ม</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted-foreground)' }}>VAT รับ (จากลูกค้า)</span>
                <span>{formatBaht(kpi.vatPayableSatang > 0 ? kpi.vatPayableSatang : 0)}</span>
              </div>
              <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex justify-between font-semibold">
                  <span>VAT ต้องนำส่ง</span>
                  <span style={{ color: kpi.vatPayableSatang > 0 ? '#991B1B' : '#065F46' }}>
                    {formatBaht(Math.max(0, kpi.vatPayableSatang))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Target vs Actual */}
          {(kpi.foodCostVarianceBps !== 0 || kpi.netProfitVarianceBps !== 0) && (
            <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--charcoal)' }}>เป้าหมาย vs จริง</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted-foreground)' }}>Food Cost Variance</span>
                  <span className={kpi.foodCostVarianceBps >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {kpi.foodCostVarianceBps >= 0 ? '+' : ''}{formatPct(kpi.foodCostVarianceBps)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted-foreground)' }}>Net Profit Variance</span>
                  <span className={kpi.netProfitVarianceBps >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {kpi.netProfitVarianceBps >= 0 ? '+' : ''}{formatPct(kpi.netProfitVarianceBps)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Export buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleExportCSV} disabled={exporting}
              className="py-3 rounded-2xl font-semibold border-2 transition-colors disabled:opacity-60 text-sm"
              style={{ borderColor: 'var(--flame-red)', color: 'var(--flame-red)' }}>
              {exporting ? 'กำลัง Export...' : '⬇️ Export CSV'}
            </button>
            <button onClick={() => setShowGAS(true)}
              className="py-3 rounded-2xl font-semibold text-white text-sm"
              style={{ background: '#0F9D58' }}>
              📊 Sync Google Sheets
            </button>
          </div>

          {/* Send Telegram */}
          <button onClick={sendTelegramSummary} disabled={sending}
            className="w-full py-3 rounded-2xl font-semibold border-2 transition-colors disabled:opacity-60"
            style={{ borderColor: 'var(--flame-red)', color: 'var(--flame-red)' }}>
            {sending ? 'กำลังส่ง...' : '📲 ส่งสรุปไป Telegram'}
          </button>
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">ไม่มีข้อมูล</div>
      )}

      {/* GAS Setup Modal */}
      {showGAS && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4"
          onClick={e => { if (e.target === e.currentTarget) setShowGAS(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b sticky top-0 bg-white"
              style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold text-base" style={{ color: 'var(--charcoal)' }}>ตั้งค่า Google Sheets Auto-sync</h2>
              <button onClick={() => setShowGAS(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-4 text-sm">

              <div className="p-3 rounded-xl text-xs" style={{ background: '#F0FDF4', color: '#166534' }}>
                GAS จะดึงข้อมูลจาก API ของ app แล้วเขียนเข้า Google Sheets อัตโนมัติทุกวัน แยก sheet ตามเดือน
              </div>

              <div>
                <p className="font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>ขั้นตอนตั้งค่า</p>
                <ol className="space-y-2" style={{ color: 'var(--muted-foreground)' }}>
                  <li className="flex gap-2"><span className="shrink-0 font-bold text-red-600">1.</span>
                    ไปที่ <strong>Vercel → Project Settings → Environment Variables</strong><br/>
                    เพิ่ม <code className="bg-gray-100 px-1 rounded">EXPORT_API_KEY</code> = รหัสลับอะไรก็ได้ เช่น <code className="bg-gray-100 px-1 rounded">kintsu2026</code>
                  </li>
                  <li className="flex gap-2"><span className="shrink-0 font-bold text-red-600">2.</span>
                    เพิ่ม <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_EXPORT_API_KEY</code> = รหัสเดียวกัน (เพื่อให้ปุ่ม Export CSV ใช้ได้)
                  </li>
                  <li className="flex gap-2"><span className="shrink-0 font-bold text-red-600">3.</span>
                    สร้าง Google Sheet ใหม่ → copy URL เอา Sheet ID
                    <br/><span className="text-xs text-gray-400">(ใน URL: .../spreadsheets/d/<strong>THIS_IS_SHEET_ID</strong>/edit)</span>
                  </li>
                  <li className="flex gap-2"><span className="shrink-0 font-bold text-red-600">4.</span>
                    เปิด Google Sheet → <strong>Extensions → Apps Script</strong> → วาง script ด้านล่าง
                  </li>
                  <li className="flex gap-2"><span className="shrink-0 font-bold text-red-600">5.</span>
                    แก้ไข <code className="bg-gray-100 px-1 rounded">API_KEY</code> และ <code className="bg-gray-100 px-1 rounded">SHEET_ID</code> ใน script
                  </li>
                  <li className="flex gap-2"><span className="shrink-0 font-bold text-red-600">6.</span>
                    กด <strong>Run → syncCurrentMonth</strong> ครั้งแรก แล้วตั้ง Trigger ให้รันทุกวัน
                  </li>
                </ol>
              </div>

              <div>
                <p className="font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Google Apps Script</p>
                <pre className="text-xs bg-gray-50 border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap"
                  style={{ borderColor: 'var(--border)', color: '#374151' }}>{GAS_SCRIPT}</pre>
                <button
                  onClick={() => navigator.clipboard.writeText(GAS_SCRIPT).then(() => alert('Copy แล้ว!'))}
                  className="mt-2 w-full py-2 text-sm font-medium rounded-xl border"
                  style={{ borderColor: 'var(--border)', color: 'var(--flame-red)' }}>
                  📋 Copy Script
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const GAS_SCRIPT = `// KINTSU Accounting → Google Sheets Auto-sync
// อัปเดตล่าสุด: 29/05/2569 — วันที่เป็น พ.ศ., delete webhook, sumCol fix, recorded_date/time
const API_BASE = 'https://kintsu-accounting.vercel.app'
const API_KEY  = 'kintsu2026'
const SHEET_ID = '19Wx98_aE0R9mDF15SxQw66u-YbzG4WGqAO7pv1O3LvA'

// แปลงวันที่ YYYY-MM-DD → DD/MM/พ.ศ.
function toBE(dateStr) {
  if (!dateStr) return ''
  const parts = String(dateStr).split('-')
  if (parts.length !== 3) return dateStr
  return parts[2] + '/' + parts[1] + '/' + (parseInt(parts[0]) + 543)
}

// แปลงเดือน YYYY-MM → MM/พ.ศ.
function monthToBE(month) {
  if (!month) return month
  const parts = String(month).split('-')
  if (parts.length !== 2) return month
  return parts[1] + '/' + (parseInt(parts[0]) + 543)
}

// รับข้อมูล real-time จาก Next.js webhook แล้ว sync ทั้งเดือนใหม่เลย
function doPost(e) {
  try {
    const row = JSON.parse(e.postData.contents)
    const month = row.month || (row.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')).substring(0, 7)
    syncMonth(month)
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON)
  }
}

function syncCurrentMonth() {
  const month = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM')
  syncMonth(month)
}

function syncMonth(month) {
  const url = API_BASE + '/api/export?month=' + month + '&type=json&key=' + API_KEY
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true })
  if (res.getResponseCode() !== 200) {
    console.error('Error:', res.getContentText()); return
  }
  const data = JSON.parse(res.getContentText())
  const ss = SpreadsheetApp.openById(SHEET_ID)
  writeExpenses(ss, month, data.expenses, data.categories || [])
  writeSales(ss, month, data.sales)
  writeSummary(ss)
  console.log('Synced ' + month + ': ' + data.expenses.length + ' expenses, ' + data.sales.length + ' sales days')
}

function writeExpenses(ss, month, rows, categories) {
  const name = month + ' รายจ่าย'
  let sh = ss.getSheetByName(name) || ss.insertSheet(name)
  sh.clear()  // clear content + formatting ป้องกันสีค้าง
  const H = ['วันที่','เวลา','หมวดหมู่','ยอดเงิน','วิธีชำระ','ธนาคาร','เลขบัญชี','ผู้รับเงิน','หมายเหตุ','บันทึกโดย','วันที่บันทึก','เวลาบันทึก']
  sh.getRange(1,1,1,H.length).setValues([H]).setFontWeight('bold').setBackground('#D33F22').setFontColor('#FFFFFF')
  if (!rows.length) return
  const data = rows.map(e=>[toBE(e.date),e.time,e.category,e.amount,e.payment_method,e.bank,e.account,e.recipient,e.note,e.recorded_by,toBE(e.recorded_date),e.recorded_time||''])
  sh.getRange(2,1,data.length,H.length).setValues(data).setFontWeight('normal')
  sh.getRange(2,4,data.length,1).setNumberFormat('#,##0.00')
  const totalRow = data.length+2
  sh.getRange(totalRow,3).setValue('รวมทั้งหมด').setFontWeight('bold')
  sh.getRange(totalRow,4).setFormula('=SUM(D2:D'+(data.length+1)+')').setFontWeight('bold').setNumberFormat('#,##0.00')

  // Summary by category
  const cats = (categories && categories.length) ? categories : [...new Set(rows.map(r=>r.category))]
  let r = totalRow + 2
  sh.getRange(r,1).setValue('สรุปตามหมวดหมู่').setFontWeight('bold').setBackground('#FEF2F2')
  r++
  cats.forEach(cat => {
    const catRows = rows.filter(e=>e.category===cat)
    if (!catRows.length) return
    const total = catRows.reduce((s,e)=>s+e.amount,0)
    sh.getRange(r,1).setValue(cat).setFontWeight('normal').setBackground(null)
    sh.getRange(r,2).setValue(total).setNumberFormat('#,##0.00').setFontWeight('normal').setBackground(null)
    r++
  })
  sh.autoResizeColumns(1,H.length)
}

function writeSales(ss, month, rows) {
  const name = month + ' รายรับ'
  let sh = ss.getSheetByName(name) || ss.insertSheet(name)
  sh.clearContents()
  const H = ['วันที่','Dine-in','จำนวนโต๊ะ','GrabFood Gross','GP 30%','GrabFood Net','Takeaway','รวมสุทธิ']
  sh.getRange(1,1,1,H.length).setValues([H]).setFontWeight('bold').setBackground('#D33F22').setFontColor('#FFFFFF')
  if (!rows.length) return
  const data = rows.map(s=>[toBE(s.date),s.dine_in,s.dine_in_covers,s.grabfood_gross,s.grabfood_gp,s.grabfood_net,s.takeaway,s.total_net])
  sh.getRange(2,1,data.length,H.length).setValues(data)
  ;[2,4,5,6,7,8].forEach(c=>sh.getRange(2,c,data.length,1).setNumberFormat('#,##0.00'))
  const tot = data.length+2
  sh.getRange(tot,1).setValue('รวม').setFontWeight('bold')
  ;[2,4,5,6,7,8].forEach(c=>{
    const col = String.fromCharCode(64+c)
    sh.getRange(tot,c).setFormula('=SUM('+col+'2:'+col+(data.length+1)+')').setFontWeight('bold').setNumberFormat('#,##0.00')
  })
  sh.autoResizeColumns(1,H.length)
}

function writeSummary(ss) {
  let sh = ss.getSheetByName('สรุป') || ss.insertSheet('สรุป', 0)
  sh.clearContents()
  const H = ['เดือน','รายรับ (฿)','รายจ่าย (฿)','กำไร (฿)']
  sh.getRange(1,1,1,4).setValues([H]).setFontWeight('bold').setBackground('#D33F22').setFontColor('#FFFFFF')
  const months = ss.getSheets()
    .map(s=>s.getName().match(/^(\\d{4}-\\d{2}) รายรับ$/))
    .filter(Boolean).map(m=>m[1]).sort()
  const rows = months.map(m=>{
    const rev = sumCol(ss, m+' รายรับ', 8)
    const exp = sumCol(ss, m+' รายจ่าย', 4)
    return [monthToBE(m), rev, exp, rev-exp]
  })
  if (rows.length) {
    sh.getRange(2,1,rows.length,4).setValues(rows)
    sh.getRange(2,2,rows.length,3).setNumberFormat('#,##0.00')
    rows.forEach((r,i)=>sh.getRange(i+2,4).setFontColor(r[3]>=0?'#16a34a':'#dc2626'))
  }
  sh.autoResizeColumns(1,4)
}

function sumCol(ss, sheetName, col) {
  const sh = ss.getSheetByName(sheetName)
  if (!sh || sh.getLastRow() < 2) return 0
  const range = sh.getRange(2, col, sh.getLastRow()-1, 1)
  const vals = range.getValues()
  const formulas = range.getFormulas()
  // ข้ามแถวที่เป็น formula (เช่น แถว รวมทั้งหมด) เพื่อกันนับซ้ำ
  return vals.reduce((s, r, i) => {
    if (formulas[i][0]) return s
    return s + (typeof r[0] === 'number' ? r[0] : 0)
  }, 0)
}

// ตั้ง Trigger: Triggers → Add Trigger → syncCurrentMonth → Time-driven → Day timer → 11pm-midnight (Asia/Bangkok)`

function PLRow({ label, value, pct, type, badge }: {
  label: string; value: number; pct?: number; type: 'income'|'expense'|'subtotal'|'profit'|'loss'; badge?: string
}) {
  const textColor = type === 'profit' ? '#065F46' : type === 'loss' ? '#991B1B' : 'var(--charcoal)'
  const bg = (type === 'subtotal' || type === 'profit' || type === 'loss') ? 'var(--muted)' : 'white'
  const bold = type !== 'expense'

  return (
    <div className="flex justify-between items-center px-4 py-3" style={{ background: bg }}>
      <div className="flex items-center gap-2">
        <span className={bold ? 'font-semibold text-sm' : 'text-sm'} style={{ color: 'var(--muted-foreground)' }}>
          {label}
        </span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{badge}</span>
        )}
      </div>
      <div className="text-right">
        <span className={bold ? 'font-semibold text-sm' : 'text-sm'} style={{ color: textColor }}>
          {value < 0 ? `(${formatBaht(Math.abs(value))})` : formatBaht(value)}
        </span>
        {pct !== undefined && (
          <span className="text-xs ml-1" style={{ color: 'var(--muted-foreground)' }}>
            {formatPct(pct)}
          </span>
        )}
      </div>
    </div>
  )
}
