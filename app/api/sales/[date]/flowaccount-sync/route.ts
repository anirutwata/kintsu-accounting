import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCashInvoice } from '@/lib/flowaccount'

export async function POST(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }
  const supabase = await createClient()

  const { data: day, error: dayError } = await supabase
    .from('daily_sales')
    .select('*')
    .eq('id', date)
    .single()
  if (dayError || !day) {
    return NextResponse.json({ error: dayError?.message || 'ไม่พบยอดขายวันนี้' }, { status: 404 })
  }
  if (!day.total_net_satang) {
    return NextResponse.json({ error: 'ยอดขายวันนี้เป็น 0 บาท' }, { status: 400 })
  }

  const preVatSatang = Math.max(0, day.total_net_satang - (day.total_vat_satang || 0))

  try {
    const result = await createCashInvoice({
      contactName: 'ลูกค้าทั่วไป',
      publishedOn: date,
      remarks: `สรุปยอดขายวันที่ ${date} (Dine-in/Grab/Takeaway)`,
      items: [
        {
          name: `ยอดขายวันที่ ${date}`,
          quantity: 1,
          unitName: 'วัน',
          pricePerUnit: preVatSatang / 100,
        },
      ],
    })

    const { data: updated, error: updateError } = await supabase
      .from('daily_sales')
      .update({
        flowaccount_record_id: result.recordId,
        flowaccount_document_serial: result.documentSerial,
        flowaccount_synced_at: new Date().toISOString(),
      })
      .eq('id', date)
      .select()
      .single()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
