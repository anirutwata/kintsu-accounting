'use client'
import { useState, useEffect, useRef } from 'react'
import { getTodayBKK } from '@/lib/utils'

interface BankAccount { id: string; bank_name: string; account_number: string; account_name: string }

interface Entry {
  date: string
  description: string
  amount: number
  type: 'in' | 'out'
  source?: string
}

interface MatchItem {
  statement: Entry
  system: Entry
  dayDiff: number
  amountDiff: number
}

interface ReconcileResult {
  matched: MatchItem[]
  statementOnly: Entry[]
  systemOnly: Entry[]
  summary: {
    stmIn: number; stmOut: number
    sysIn: number; sysOut: number
    matchedCount: number; statementOnlyCount: number; systemOnlyCount: number
  }
  statementCount: number
  systemCount: number
}

function fmtBaht(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function getMonthOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ value, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) })
  }
  return opts
}

type Tab = 'matched' | 'stmt_only' | 'sys_only'

export default function ReconcilePage() {
  const today = getTodayBKK()
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [selectedBank, setSelectedBank] = useState('')
  const [month, setMonth] = useState(today.substring(0, 7))
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReconcileResult | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('matched')
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const monthOptions = getMonthOptions()

  useEffect(() => {
    fetch('/api/bank-accounts').then(r => r.json()).then(d => setAccounts(Array.isArray(d) ? d : []))
  }, [])

  function handleFile(f: File) {
    setFile(f)
    setResult(null)
    setError('')
  }

  async function handleExportToSheet() {
    if (!result) return
    setExporting(true)
    setExportMsg('')
    try {
      const bankLabel = selectedBank
        ? accounts.find(a => a.bank_name === selectedBank)?.bank_name + ' ' + (accounts.find(a => a.bank_name === selectedBank)?.account_number || '')
        : 'ทุกธนาคาร'
      const res = await fetch('/api/reconcile/to-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank: bankLabel.trim(), month, ...result }),
      })
      const data = await res.json()
      if (res.ok) setExportMsg('✅ ส่งไป Google Sheet เรียบร้อย')
      else setExportMsg('❌ ' + (data.error || 'เกิดข้อผิดพลาด'))
    } catch {
      setExportMsg('❌ เชื่อมต่อไม่ได้')
    } finally {
      setExporting(false)
    }
  }

  async function handleSubmit() {
    if (!file) { setError('กรุณาเลือกไฟล์ Statement'); return }
    if (!month) { setError('กรุณาเลือกเดือน'); return }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('bank', selectedBank)
      fd.append('month', month)
      const res = await fetch('/api/reconcile', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      setResult(data)
      setTab(data.summary.statementOnlyCount > 0 || data.summary.systemOnlyCount > 0 ? 'stmt_only' : 'matched')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const sourceLabel: Record<string, string> = {
    expense: '🧾 รายจ่าย',
    sales: '💰 ยอดขาย (โอน)',
    sales_cash: '💵 ยอดขาย (สด)',
    transfer: '🔄 โอนเงิน',
  }

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>กระทบยอด Statement</h1>

      {/* Upload Form */}
      <div className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>

        {/* File drop zone */}
        <div
          className="relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-colors"
          style={{ borderColor: dragging ? 'var(--flame-red)' : 'var(--border)', background: dragging ? '#FFF5F3' : '#FAFAFA' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
          <input ref={fileRef} type="file" accept=".pdf,.csv,.xlsx,.xls"
            className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <div className="space-y-1">
              <p className="text-2xl">📄</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{file.name}</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {(file.size / 1024).toFixed(0)} KB · แตะเพื่อเปลี่ยน
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-3xl">📂</p>
              <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                แนบไฟล์ Statement
              </p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>PDF · CSV · Excel</p>
            </div>
          )}
        </div>

        {/* Bank + Month */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>ธนาคาร</label>
            <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              <option value="">ทุกธนาคาร</option>
              {accounts.map(a => (
                <option key={a.id} value={a.bank_name}>
                  {a.bank_name} {a.account_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted-foreground)' }}>เดือน</label>
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

        <button onClick={handleSubmit} disabled={loading || !file}
          className="w-full py-3 rounded-2xl font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--flame-red)' }}>
          {loading ? <><span className="animate-spin">⏳</span> AI กำลังอ่านและกระทบยอด...</> : '🔍 กระทบยอด'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-2xl border p-3 space-y-1" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>เงินเข้า</p>
              <p className="text-sm font-bold" style={{ color: '#16a34a' }}>฿{fmtBaht(result.summary.stmIn)}</p>
              <p className="text-[10px]" style={{ color: Math.abs(result.summary.stmIn - result.summary.sysIn) < 1 ? '#16a34a' : '#dc2626' }}>
                {Math.abs(result.summary.stmIn - result.summary.sysIn) < 1
                  ? '✅ ตรงกัน'
                  : `⚠️ ต่าง ฿${fmtBaht(Math.abs(result.summary.stmIn - result.summary.sysIn))}`}
              </p>
            </div>
            <div className="bg-white rounded-2xl border p-3 space-y-1" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>เงินออก</p>
              <p className="text-sm font-bold" style={{ color: '#dc2626' }}>฿{fmtBaht(result.summary.stmOut)}</p>
              <p className="text-[10px]" style={{ color: Math.abs(result.summary.stmOut - result.summary.sysOut) < 1 ? '#16a34a' : '#dc2626' }}>
                {Math.abs(result.summary.stmOut - result.summary.sysOut) < 1
                  ? '✅ ตรงกัน'
                  : `⚠️ ต่าง ฿${fmtBaht(Math.abs(result.summary.stmOut - result.summary.sysOut))}`}
              </p>
            </div>
          </div>

          {/* Match rate */}
          <div className="bg-white rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>ผลการจับคู่</span>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Statement {result.statementCount} รายการ · ระบบ {result.systemCount} รายการ
              </span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="flex-1 text-center py-1.5 rounded-xl font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>
                ✅ ตรงกัน {result.summary.matchedCount}
              </span>
              <span className="flex-1 text-center py-1.5 rounded-xl font-semibold"
                style={{ background: result.summary.statementOnlyCount > 0 ? '#fef9c3' : '#f0fdf4', color: result.summary.statementOnlyCount > 0 ? '#854d0e' : '#166534' }}>
                ⚠️ ไม่พบในระบบ {result.summary.statementOnlyCount}
              </span>
              <span className="flex-1 text-center py-1.5 rounded-xl font-semibold"
                style={{ background: result.summary.systemOnlyCount > 0 ? '#fee2e2' : '#f0fdf4', color: result.summary.systemOnlyCount > 0 ? '#991b1b' : '#166534' }}>
                ⚠️ ไม่พบใน Stmt {result.summary.systemOnlyCount}
              </span>
            </div>
          </div>

          {/* Export to Sheet */}
          <div className="space-y-2">
            <button onClick={handleExportToSheet} disabled={exporting}
              className="w-full py-2.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 border-2 disabled:opacity-50 transition-colors"
              style={{ borderColor: 'var(--flame-red)', color: 'var(--flame-red)', background: 'white' }}>
              {exporting ? <><span className="animate-spin">⏳</span> กำลังส่ง...</> : '📊 ส่งผลไปยัง Google Sheet'}
            </button>
            {exportMsg && (
              <p className="text-xs text-center py-2 rounded-xl"
                style={{ background: exportMsg.startsWith('✅') ? '#dcfce7' : '#fee2e2',
                         color: exportMsg.startsWith('✅') ? '#166534' : '#991b1b' }}>
                {exportMsg}
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {([
              { key: 'matched',   label: `✅ ตรงกัน (${result.summary.matchedCount})` },
              { key: 'stmt_only', label: `⚠️ ไม่พบในระบบ (${result.summary.statementOnlyCount})` },
              { key: 'sys_only',  label: `⚠️ ไม่พบใน Stmt (${result.summary.systemOnlyCount})` },
            ] as { key: Tab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex-1 py-2 text-[11px] font-semibold transition-colors"
                style={{
                  background: tab === t.key ? 'var(--flame-red)' : 'white',
                  color: tab === t.key ? 'white' : 'var(--muted-foreground)',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="space-y-2">

            {/* Matched */}
            {tab === 'matched' && (
              result.matched.length === 0
                ? <p className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>ไม่มีรายการที่จับคู่ได้</p>
                : result.matched.map((m, i) => (
                  <div key={i} className="bg-white rounded-2xl border overflow-hidden"
                    style={{ borderColor: 'var(--border)', borderLeft: `4px solid ${m.dayDiff !== 0 ? '#f59e0b' : '#16a34a'}` }}>
                    <div className="p-3 space-y-2">
                      {/* Statement side */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: '#dbeafe', color: '#1e40af' }}>Statement</span>
                            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{fmtDate(m.statement.date)}</span>
                          </div>
                          <p className="text-xs truncate" style={{ color: 'var(--charcoal)' }}>{m.statement.description}</p>
                        </div>
                        <p className="text-sm font-bold shrink-0"
                          style={{ color: m.statement.type === 'in' ? '#16a34a' : '#dc2626' }}>
                          {m.statement.type === 'in' ? '+' : '-'}฿{fmtBaht(m.statement.amount)}
                        </p>
                      </div>
                      {/* System side */}
                      <div className="flex items-start justify-between gap-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: '#dcfce7', color: '#166534' }}>ระบบ</span>
                            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{fmtDate(m.system.date)}</span>
                            {m.system.source && <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{sourceLabel[m.system.source] ?? m.system.source}</span>}
                          </div>
                          <p className="text-xs truncate" style={{ color: 'var(--charcoal)' }}>{m.system.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold"
                            style={{ color: m.system.type === 'in' ? '#16a34a' : '#dc2626' }}>
                            {m.system.type === 'in' ? '+' : '-'}฿{fmtBaht(m.system.amount)}
                          </p>
                          {m.dayDiff !== 0 && (
                            <p className="text-[10px]" style={{ color: '#d97706' }}>ต่างวัน {m.dayDiff > 0 ? '+' : ''}{m.dayDiff}d</p>
                          )}
                          {Math.abs(m.amountDiff) > 0.01 && (
                            <p className="text-[10px]" style={{ color: '#dc2626' }}>ต่างยอด ฿{fmtBaht(Math.abs(m.amountDiff))}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
            )}

            {/* Statement only (not in system) */}
            {tab === 'stmt_only' && (
              result.statementOnly.length === 0
                ? <p className="text-center py-8 text-sm" style={{ color: '#16a34a' }}>✅ ทุกรายการใน Statement พบในระบบครบ</p>
                : result.statementOnly.map((e, i) => (
                  <div key={i} className="bg-white rounded-2xl border overflow-hidden"
                    style={{ borderColor: 'var(--border)', borderLeft: '4px solid #f59e0b' }}>
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: '#fef9c3', color: '#854d0e' }}>ใน Statement เท่านั้น</span>
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{fmtDate(e.date)}</span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--charcoal)' }}>{e.description}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#b45309' }}>
                          → ยังไม่บันทึกในระบบ หรือบันทึกผิดวัน/ยอด
                        </p>
                      </div>
                      <p className="text-sm font-bold shrink-0" style={{ color: e.type === 'in' ? '#16a34a' : '#dc2626' }}>
                        {e.type === 'in' ? '+' : '-'}฿{fmtBaht(e.amount)}
                      </p>
                    </div>
                  </div>
                ))
            )}

            {/* System only (not in statement) */}
            {tab === 'sys_only' && (
              result.systemOnly.length === 0
                ? <p className="text-center py-8 text-sm" style={{ color: '#16a34a' }}>✅ ทุกรายการในระบบพบใน Statement ครบ</p>
                : result.systemOnly.map((e, i) => (
                  <div key={i} className="bg-white rounded-2xl border overflow-hidden"
                    style={{ borderColor: 'var(--border)', borderLeft: '4px solid #dc2626' }}>
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: '#fee2e2', color: '#991b1b' }}>ในระบบเท่านั้น</span>
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{fmtDate(e.date)}</span>
                          {e.source && <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{sourceLabel[e.source] ?? e.source}</span>}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--charcoal)' }}>{e.description}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#991b1b' }}>
                          → อาจบันทึกผิดธนาคาร หรือรายการนี้ไม่ผ่านบัญชีนี้
                        </p>
                      </div>
                      <p className="text-sm font-bold shrink-0" style={{ color: e.type === 'in' ? '#16a34a' : '#dc2626' }}>
                        {e.type === 'in' ? '+' : '-'}฿{fmtBaht(e.amount)}
                      </p>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
