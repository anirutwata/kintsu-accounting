import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const gasUrl = process.env.LEDGER_WEBHOOK_URL
  if (!gasUrl) return NextResponse.json({ error: 'LEDGER_WEBHOOK_URL ไม่ได้ตั้งค่า' }, { status: 500 })

  const body = await req.json()

  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write_reconciliation', ...body }),
      redirect: 'follow',
    })
    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = { raw: text } }
    if (!res.ok) return NextResponse.json({ error: 'GAS ตอบกลับผิดพลาด', detail: json }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'เชื่อมต่อ GAS ไม่ได้' }, { status: 500 })
  }
}
