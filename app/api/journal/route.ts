import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface JournalEntry {
  id: string
  date: string
  type: 'expense' | 'sales' | 'transfer' | 'asset'
  description: string
  ref: string
  debit_code: string
  debit_name: string
  credit_code: string
  credit_name: string
  amount: number   // baht
}

// Name-based fallback — codes match sequential sort_order: KBANK=1102, TTB=1103, UOB=1104
// Fallback uses 1199 (safe code, never assigned to a real bank via sort_order)
function bankAccount(bank: string | null, method?: string | null): { code: string; name: string } {
  if (!bank || bank.toLowerCase() === 'เงินสด' || method === 'เงินสด') return { code: '1101', name: 'เงินสด' }
  const b = bank.toLowerCase().replace(/\s/g, '')
  if (b.includes('kbank') || b.includes('กสิกร') || b.includes('kasikorn'))
    return { code: '1102', name: 'เงินฝากธนาคาร กสิกรไทย' }
  if (b.includes('ttb') || b.includes('ทหารไทย') || b.includes('tmb') || b.includes('ธนชาต'))
    return { code: '1103', name: 'เงินฝากธนาคาร TTB' }
  if (b.includes('uob') || b.includes('ยูโอบี') || b.includes('united'))
    return { code: '1104', name: 'เงินฝากธนาคาร UOB' }
  return { code: '1199', name: `เงินฝากธนาคารอื่น (${bank})` }
}

function categoryAccount(category: string): { code: string; name: string } {
  const map: Record<string, { code: string; name: string }> = {
    'วัตถุดิบทางตรง-เนื้อวัว':                   { code: '5101', name: 'วัตถุดิบทางตรง-เนื้อวัว' },
    'วัตถุดิบทางตรง-เนื้อหมู':                   { code: '5102', name: 'วัตถุดิบทางตรง-เนื้อหมู' },
    'วัตถุดิบทางตรง-อื่นๆ':                      { code: '5103', name: 'วัตถุดิบทางตรง-อื่นๆ' },
    'เครื่องดื่ม':                               { code: '5104', name: 'เครื่องดื่ม' },
    'บรรจุภัณฑ์':                               { code: '5201', name: 'บรรจุภัณฑ์' },
    'วัสดุสิ้นเปลืองในครัว':                     { code: '5202', name: 'วัสดุสิ้นเปลืองในครัว' },
    'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร':          { code: '5203', name: 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร' },
    'เงินเดือนพนักงานประจำและสวัสดิการ':          { code: '5301', name: 'เงินเดือนพนักงานประจำและสวัสดิการ' },
    'เงินเดือน- part time':                      { code: '5302', name: 'เงินเดือน-Part Time' },
    'ค่าเช่า':                                   { code: '5401', name: 'ค่าเช่า' },
    'ค่าบริการเช่าพื้นที่':                       { code: '5402', name: 'ค่าบริการเช่าพื้นที่' },
    'ค่าน้ำ':                                    { code: '5501', name: 'ค่าน้ำ' },
    'ค่าไฟ':                                     { code: '5502', name: 'ค่าไฟ' },
    'ค่าระบบต่างๆ':                              { code: '5503', name: 'ค่าระบบต่างๆ' },
    'ค่าประกัน':                                 { code: '5504', name: 'ค่าประกัน' },
    'ค่าการตลาด':                                { code: '5601', name: 'ค่าการตลาด' },
    'Commission - Grab food':                    { code: '5701', name: 'Commission-Grab food' },
    'ค่าขนส่ง':                                  { code: '5702', name: 'ค่าขนส่ง' },
    'ค่าซ่อมบำรุง':                              { code: '5703', name: 'ค่าซ่อมบำรุง' },
    'ดอกเบี้ย':                                  { code: '5704', name: 'ดอกเบี้ย' },
    'ค่าบริการอื่นๆ':                            { code: '5705', name: 'ค่าบริการอื่นๆ' },
    'เงินขาด/เกิน':                              { code: '5706', name: 'เงินขาด/เกิน' },
    'ภาษีโรงเรือน':                              { code: '5801', name: 'ภาษีโรงเรือน' },
    'ภาษีมูลค่าเพิ่ม':                           { code: '5802', name: 'ภาษีมูลค่าเพิ่ม' },
    'ภาษีอื่นๆ':                                 { code: '5803', name: 'ภาษีอื่นๆ' },
  }
  return map[category] ?? { code: '5705', name: 'ค่าบริการอื่นๆ' }
}

function assetAccount(category: string): { code: string; name: string } {
  const map: Record<string, { code: string; name: string }> = {
    'ส่วนต่อเติมอาคาร':          { code: '1501', name: 'ส่วนต่อเติมอาคาร' },
    'ระบบ':                      { code: '1502', name: 'ระบบ' },
    'อุปกรณ์ครัว':               { code: '1503', name: 'อุปกรณ์ครัว' },
    'อุปกรณ์ทั่วไปในร้านอาหาร':  { code: '1504', name: 'อุปกรณ์ทั่วไปในร้านอาหาร' },
  }
  return map[category] ?? { code: '1505', name: 'สินทรัพย์อื่นๆ' }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const month     = searchParams.get('month') || ''
  const fromParam = searchParams.get('from')  || month
  const toParam   = searchParams.get('to')    || month
  if (!fromParam) return NextResponse.json({ error: 'กรุณาระบุเดือน' }, { status: 400 })

  const [ty, tm] = toParam.split('-').map(Number)
  const startDate = `${fromParam}-01`
  const endDate   = `${toParam}-${new Date(ty, tm, 0).getDate().toString().padStart(2, '0')}`
  const nextMonth = tm === 12 ? `${ty + 1}-01-01` : `${ty}-${String(tm + 1).padStart(2, '0')}-01`

  const supabase = await createClient()
  const entries: JournalEntry[] = []

  // Fetch settings via RPC (bypasses anon role UUID column restriction)
  const { data: settingsRow } = await supabase.rpc('get_settings')

  // Build UUID → {code, name} map from bank_accounts ordered by sort_order
  const { data: allBanks } = await supabase.from('bank_accounts').select('id, bank_name, account_number, account_name').eq('is_active', true).order('sort_order')
  const bankMap = new Map<string, { code: string; name: string }>()
  ;(allBanks || []).forEach((ba, i) => {
    bankMap.set(ba.id, { code: String(1102 + i), name: `เงินฝากธนาคาร ${ba.bank_name} ${ba.account_number}` })
  })

  const defaultBank = { code: '1102', name: 'เงินฝากธนาคาร (รายรับ)' }
  const defaultGrab = { code: '1102', name: 'เงินฝากธนาคาร (Grab)' }

  function resolveBankId(id: string | null | undefined): { code: string; name: string } {
    if (!id) return defaultBank
    return bankMap.get(id) ?? defaultBank
  }

  const fsPromptpay      = resolveBankId(settingsRow?.fs_promptpay_bank_id)
  const fsCompanyTransfer = resolveBankId(settingsRow?.fs_company_transfer_bank_id)
  const fsCreditCard     = resolveBankId(settingsRow?.fs_credit_card_bank_id)
  const ppPromptpay      = resolveBankId(settingsRow?.pp_promptpay_bank_id)
  const ppCompanyTransfer = resolveBankId(settingsRow?.pp_company_transfer_bank_id)
  const ppCreditCard     = resolveBankId(settingsRow?.pp_credit_card_bank_id)
  const grabBankAccount  = resolveBankId(settingsRow?.grab_bank_account_id) ?? defaultGrab

  // 1. Expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, date, category, amount_satang, payment_method, sender_bank, recipient_name, note')
    .eq('is_deleted', false)
    .gte('date', startDate)
    .lt('date', nextMonth)
    .order('date')

  for (const e of expenses || []) {
    const debit = categoryAccount(e.category)
    const credit = bankAccount(e.sender_bank, e.payment_method)
    const desc = e.category + (e.recipient_name ? ` — ${e.recipient_name}` : '')
    entries.push({
      id: e.id,
      date: e.date,
      type: 'expense',
      description: desc,
      ref: e.note || '',
      debit_code: debit.code,
      debit_name: debit.name,
      credit_code: credit.code,
      credit_name: credit.name,
      amount: e.amount_satang / 100,
    })
  }

  // 2. Daily Sales
  const { data: sales } = await supabase
    .from('daily_sales')
    .select('date, dine_in_revenue_satang, cash_satang, promptpay_satang, company_transfer_satang, credit_card_satang, papaya_revenue_satang, papaya_cash_satang, papaya_promptpay_satang, papaya_company_transfer_satang, papaya_credit_card_satang, grabfood_gross_satang, grabfood_net_satang, takeaway_revenue_satang')
    .gte('date', startDate)
    .lt('date', nextMonth)
    .order('date')

  for (const s of sales || []) {
    const push = (id: string, desc: string, ref: string, bank: { code: string; name: string }, credit: string, creditName: string, amount: number) => {
      if (amount <= 0) return
      entries.push({ id, date: s.date, type: 'sales', description: desc, ref, debit_code: bank.code, debit_name: bank.name, credit_code: credit, credit_name: creditName, amount })
    }

    // Foodstory → 4101 (use payment breakdown if filled, else use total revenue)
    const fsPaySum = (s.cash_satang || 0) + (s.promptpay_satang || 0) + (s.company_transfer_satang || 0) + (s.credit_card_satang || 0)
    if (fsPaySum > 0) {
      push(`fs_cash_${s.date}`,      'Foodstory รายได้ (เงินสด)',     'Foodstory POS', { code: '1101', name: 'เงินสด' }, '4101', 'รายได้ Foodstory (Dine-in)', (s.cash_satang || 0) / 100)
      push(`fs_promptpay_${s.date}`, 'Foodstory รายได้ (พร้อมเพย์)',  'Foodstory POS', fsPromptpay,       '4101', 'รายได้ Foodstory (Dine-in)', (s.promptpay_satang || 0) / 100)
      push(`fs_company_${s.date}`,   'Foodstory รายได้ (โอนบริษัท)', 'Foodstory POS', fsCompanyTransfer, '4101', 'รายได้ Foodstory (Dine-in)', (s.company_transfer_satang || 0) / 100)
      push(`fs_card_${s.date}`,      'Foodstory รายได้ (บัตรเครดิต)','Foodstory POS', fsCreditCard,      '4101', 'รายได้ Foodstory (Dine-in)', (s.credit_card_satang || 0) / 100)
    } else {
      push(`fs_total_${s.date}`, 'Foodstory รายได้', 'Foodstory POS', defaultBank, '4101', 'รายได้ Foodstory (Dine-in)', (s.dine_in_revenue_satang || 0) / 100)
    }

    // Papaya → 4102
    const ppPaySum = (s.papaya_cash_satang || 0) + (s.papaya_promptpay_satang || 0) + (s.papaya_company_transfer_satang || 0) + (s.papaya_credit_card_satang || 0)
    if (ppPaySum > 0) {
      push(`pp_cash_${s.date}`,      'Papaya รายได้ (เงินสด)',        'Papaya POS', { code: '1101', name: 'เงินสด' }, '4102', 'รายได้ Papaya POS (Dine-in)', (s.papaya_cash_satang || 0) / 100)
      push(`pp_promptpay_${s.date}`, 'Papaya รายได้ (พร้อมเพย์)',     'Papaya POS', ppPromptpay,       '4102', 'รายได้ Papaya POS (Dine-in)', (s.papaya_promptpay_satang || 0) / 100)
      push(`pp_company_${s.date}`,   'Papaya รายได้ (โอนบริษัท)',     'Papaya POS', ppCompanyTransfer, '4102', 'รายได้ Papaya POS (Dine-in)', (s.papaya_company_transfer_satang || 0) / 100)
      push(`pp_card_${s.date}`,      'Papaya รายได้ (บัตรเครดิต)',    'Papaya POS', ppCreditCard,      '4102', 'รายได้ Papaya POS (Dine-in)', (s.papaya_credit_card_satang || 0) / 100)
    } else {
      push(`pp_total_${s.date}`, 'Papaya POS รายได้', 'Papaya POS', defaultBank, '4102', 'รายได้ Papaya POS (Dine-in)', (s.papaya_revenue_satang || 0) / 100)
    }

    // Grab → 4103
    const grabGross = (s.grabfood_gross_satang || 0) / 100
    const grabNet   = (s.grabfood_net_satang || 0) / 100
    const grabFee   = Math.round((grabGross - grabNet) * 100) / 100
    push(`grab_${s.date}`, 'Grab รายได้ (ยอดสุทธิ)',
      `รวม ${grabGross.toLocaleString('th-TH', { minimumFractionDigits: 2 })} หัก GP ${grabFee.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      grabBankAccount, '4103', 'รายได้จากการขาย (Grab)', grabNet)

    // Takeaway → 4104
    push(`tw_${s.date}`, 'กลับบ้าน (Takeaway)', 'Takeaway', { code: '1101', name: 'เงินสด' }, '4104', 'รายได้จากการขาย (Takeaway)', (s.takeaway_revenue_satang || 0) / 100)
  }

  // 3. Bank Transfers
  const { data: transfers } = await supabase
    .from('bank_transfers')
    .select('id, date, amount_satang, from_bank, from_account, to_bank, to_account, note')
    .gte('date', startDate)
    .lt('date', nextMonth)
    .order('date')

  for (const t of transfers || []) {
    const debit = bankAccount(t.to_bank)
    const credit = bankAccount(t.from_bank)
    entries.push({
      id: t.id,
      date: t.date,
      type: 'transfer',
      description: `โอนเงิน ${credit.name} → ${debit.name}`,
      ref: `${t.from_account || ''} → ${t.to_account || ''}${t.note ? ' | ' + t.note : ''}`.trim().replace(/^→\s*/, '').replace(/\s*→\s*$/, ''),
      debit_code: debit.code,
      debit_name: debit.name,
      credit_code: credit.code,
      credit_name: credit.name,
      amount: t.amount_satang / 100,
    })
  }

  // 4. Assets
  const { data: assets } = await supabase
    .from('assets')
    .select('id, purchase_date, name, category, purchase_satang, payment_bank')
    .gte('purchase_date', startDate)
    .lte('purchase_date', endDate)
    .order('purchase_date')

  for (const a of assets || []) {
    const credit = bankAccount(a.payment_bank)
    const debit = assetAccount(a.category)
    entries.push({
      id: a.id,
      date: a.purchase_date,
      type: 'asset',
      description: `ซื้อสินทรัพย์: ${a.name}`,
      ref: a.category || '',
      debit_code: debit.code,
      debit_name: debit.name,
      credit_code: credit.code,
      credit_name: credit.name,
      amount: a.purchase_satang / 100,
    })
  }

  // Sort by date then type
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type))

  const totalIn  = entries.filter(e => e.type === 'sales').reduce((s, e) => s + e.amount, 0)
  const totalOut = entries.filter(e => e.type === 'expense' || e.type === 'asset').reduce((s, e) => s + e.amount, 0)

  return NextResponse.json({ entries, totalIn, totalOut, count: entries.length })
}
