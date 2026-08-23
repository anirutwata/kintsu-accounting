import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCashInvoice, resolveTaxInvoicePayment } from '@/lib/flowaccount'
import { resolveDefaultPaymentConfig } from '@/lib/paymentConfig'

// Only Dine-in (Foodstory) + Papaya POS have a payment-channel breakdown — GrabFood and
// Takeaway are recorded as a single lump revenue figure with no cash/transfer/credit split,
// so they're excluded from this sync for now.
const CHANNELS = [
  { key: 'cash', label: 'เงินสด', method: 'cash' as const },
  { key: 'transfer', label: 'โอนเงิน/พร้อมเพย์', method: 'transfer' as const },
  { key: 'credit_card', label: 'บัตรเครดิต (EDC)', method: 'credit_card' as const },
]

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

  const combinedRevenue = (day.dine_in_revenue_satang || 0) + (day.papaya_revenue_satang || 0)
  const combinedVat = (day.vat_amount_satang || 0) + (day.papaya_vat_satang || 0)
  if (combinedRevenue <= 0) {
    return NextResponse.json(
      { error: 'ยอดขาย Dine-in/Papaya วันนี้เป็น 0 บาท (GrabFood/Takeaway ยังไม่รองรับการส่งเข้า FlowAccount)' },
      { status: 400 },
    )
  }

  const amountByChannel: Record<string, number> = {
    cash: (day.cash_satang || 0) + (day.papaya_cash_satang || 0),
    transfer:
      (day.promptpay_satang || 0) +
      (day.company_transfer_satang || 0) +
      (day.papaya_promptpay_satang || 0) +
      (day.papaya_company_transfer_satang || 0),
    credit_card: (day.credit_card_satang || 0) + (day.papaya_credit_card_satang || 0),
  }

  const updates: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  const paymentConfig = await resolveDefaultPaymentConfig(supabase)

  for (const channel of CHANNELS) {
    const amountSatang = amountByChannel[channel.key]
    if (amountSatang <= 0) continue

    // VAT isn't tracked per payment channel, only per day — split it proportionally to
    // each channel's share of combined Dine-in+Papaya revenue so the 3 invoices' totals
    // still add up to the recorded combinedRevenue/combinedVat.
    const vatSatang = Math.round((combinedVat * amountSatang) / combinedRevenue)
    const preVatSatang = amountSatang - vatSatang

    try {
      const payment = resolveTaxInvoicePayment(channel.method, date, 0, paymentConfig)
      const result = await createCashInvoice({
        contactName: 'ลูกค้าทั่วไป',
        publishedOn: date,
        remarks: `สรุปยอดขายวันที่ ${date} - ${channel.label} (Dine-in/Papaya)`,
        items: [
          {
            name: `ยอดขายวันที่ ${date} - ${channel.label}`,
            quantity: 1,
            unitName: 'วัน',
            pricePerUnit: preVatSatang / 100,
          },
        ],
        payment,
      })
      updates[`flowaccount_${channel.key}_record_id`] = result.recordId
      updates[`flowaccount_${channel.key}_document_serial`] = result.documentSerial
      updates[`flowaccount_${channel.key}_synced_at`] = new Date().toISOString()
    } catch (err: any) {
      errors[channel.key] = err.message
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: `ส่งไม่สำเร็จทุกช่องทาง: ${JSON.stringify(errors)}` }, { status: 502 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('daily_sales')
    .update(updates)
    .eq('id', date)
    .select()
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ...updated, partialErrors: errors }, { status: 207 })
  }
  return NextResponse.json(updated)
}
