import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegram, buildAssetMessage } from '@/lib/telegram'

function triggerGasSync() {
  const gasUrl = process.env.GAS_WEBHOOK_URL
  if (gasUrl) fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_assets' }) }).catch(() => {})
}

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('purchase_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  const { name, category, purchase_date, purchase_satang, salvage_satang, useful_life_months, description, payment_method, payment_bank, payment_account, slip_image_url, receipt_image_urls } = body

  if (!name?.trim() || !category || !purchase_date || !purchase_satang) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      name: name.trim(),
      category,
      purchase_date,
      purchase_satang: Math.round(purchase_satang),
      salvage_satang: Math.round(salvage_satang || 0),
      useful_life_months: Math.round(useful_life_months || 60),
      description: description?.trim() || null,
      payment_method: payment_method || null,
      payment_bank: payment_bank?.trim() || null,
      payment_account: payment_account?.trim() || null,
      slip_image_url: slip_image_url || null,
      receipt_image_urls: receipt_image_urls || [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  triggerGasSync()
  sendTelegram(buildAssetMessage({
    name: data.name,
    category: data.category,
    purchaseSatang: data.purchase_satang,
    usefulLifeMonths: data.useful_life_months,
    isUpdate: false,
    paymentMethod: data.payment_method,
    paymentBank: data.payment_bank,
  }))
  return NextResponse.json(data)
}
