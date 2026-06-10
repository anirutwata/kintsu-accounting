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

function bankAccount(bank: string | null, method?: string | null): { code: string; name: string } {
  if (!bank && method === 'เงินสด') return { code: '1101', name: 'เงินสด' }
  if (!bank) return { code: '1101', name: 'เงินสด' }
  const b = bank.toLowerCase().replace(/\s/g, '')
  if (b.includes('ttb') || b.includes('ทหารไทย') || b.includes('tmb') || b.includes('ธนชาต'))
    return { code: '1102', name: 'เงินฝากธนาคาร TTB' }
  if (b.includes('kbank') || b.includes('กสิกร'))
    return { code: '1103', name: 'เงินฝากธนาคาร KBANK' }
  if (b.includes('scb') || b.includes('ไทยพาณิชย์'))
    return { code: '1104', name: 'เงินฝากธนาคาร SCB' }
  if (b.includes('bbl') || b.includes('กรุงเทพ'))
    return { code: '1104', name: 'เงินฝากธนาคาร BBL' }
  return { code: '1104', name: `เงินฝากธนาคาร (${bank})` }
}

function categoryAccount(category: string): { code: string; name: string } {
  const c = category.toLowerCase()
  if (c.includes('วัตถุดิบ') || c.includes('อาหาร') || c.includes('เครื่องดื่ม') || c.includes('ส่วนผสม'))
    return { code: '5101', name: 'ต้นทุนวัตถุดิบ' }
  if (c.includes('เงินเดือน') || c.includes('ค่าแรง') || c.includes('แรงงาน') || c.includes('ค่าจ้าง'))
    return { code: '5201', name: 'เงินเดือนและค่าแรง' }
  if (c.includes('เช่า'))
    return { code: '5301', name: 'ค่าเช่า' }
  if (c.includes('ไฟ') || c.includes('น้ำ') || c.includes('สาธารณ') || c.includes('อินเทอร์') || c.includes('โทรศัพท์'))
    return { code: '5302', name: 'ค่าสาธารณูปโภค' }
  if (c.includes('ซ่อม') || c.includes('บำรุง'))
    return { code: '5303', name: 'ค่าซ่อมแซมและบำรุงรักษา' }
  if (c.includes('บรรจุ') || c.includes('วัสดุ') || c.includes('กล่อง') || c.includes('ถุง'))
    return { code: '5304', name: 'ค่าบรรจุภัณฑ์และวัสดุ' }
  if (c.includes('การตลาด') || c.includes('โฆษณา') || c.includes('ประชาสัมพันธ์'))
    return { code: '5305', name: 'ค่าใช้จ่ายทางการตลาด' }
  if (c.includes('เสื่อม'))
    return { code: '5401', name: 'ค่าเสื่อมราคา' }
  if (c.includes('ธนาคาร') || c.includes('ค่าธรรมเนียม'))
    return { code: '5501', name: 'ค่าธรรมเนียมธนาคาร' }
  return { code: '5601', name: 'ค่าใช้จ่ายทั่วไป' }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || ''
  if (!month) return NextResponse.json({ error: 'กรุณาระบุเดือน' }, { status: 400 })

  const [y, m] = month.split('-').map(Number)
  const startDate = `${month}-01`
  const endDate = `${month}-${new Date(y, m, 0).getDate().toString().padStart(2, '0')}`
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const supabase = await createClient()
  const entries: JournalEntry[] = []

  // Fetch settings for income bank accounts
  const { data: settingsRow } = await supabase.from('settings').select('income_bank_account_id, grab_bank_account_id').eq('id', 1).single()
  let incomeBankAccount: { code: string; name: string } = { code: '1102', name: 'เงินฝากธนาคาร (รายรับ)' }
  let grabBankAccount:   { code: string; name: string } = { code: '1103', name: 'เงินฝากธนาคาร (Grab)' }

  if (settingsRow?.income_bank_account_id) {
    const { data: ba } = await supabase.from('bank_accounts').select('bank_name, account_number').eq('id', settingsRow.income_bank_account_id).single()
    if (ba) incomeBankAccount = bankAccount(ba.bank_name)
  }
  if (settingsRow?.grab_bank_account_id) {
    const { data: ba } = await supabase.from('bank_accounts').select('bank_name, account_number').eq('id', settingsRow.grab_bank_account_id).single()
    if (ba) grabBankAccount = bankAccount(ba.bank_name)
  }

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
    .select('date, cash_satang, papaya_cash_satang, promptpay_satang, company_transfer_satang, credit_card_satang, papaya_promptpay_satang, papaya_company_transfer_satang, papaya_credit_card_satang, grab_net_satang, grab_satang, papaya_grab_satang')
    .gte('date', startDate)
    .lt('date', nextMonth)
    .order('date')

  for (const s of sales || []) {
    const cash = ((s.cash_satang || 0) + (s.papaya_cash_satang || 0)) / 100
    const electronic = (
      (s.promptpay_satang || 0) + (s.company_transfer_satang || 0) + (s.credit_card_satang || 0) +
      (s.papaya_promptpay_satang || 0) + (s.papaya_company_transfer_satang || 0) + (s.papaya_credit_card_satang || 0)
    ) / 100
    const grabGross = ((s.grab_satang || 0) + (s.papaya_grab_satang || 0)) / 100
    const grabNet = ((s.grab_net_satang || 0)) / 100
    const grabFee = Math.round((grabGross - grabNet) * 100) / 100

    if (cash > 0) {
      entries.push({
        id: `sales_cash_${s.date}`,
        date: s.date,
        type: 'sales',
        description: 'รายได้ยอดขาย (เงินสด)',
        ref: 'Dine-in / Takeaway',
        debit_code: '1101', debit_name: 'เงินสด',
        credit_code: '4101', credit_name: 'รายได้จากการขาย (Dine-in)',
        amount: cash,
      })
    }
    if (electronic > 0) {
      entries.push({
        id: `sales_elec_${s.date}`,
        date: s.date,
        type: 'sales',
        description: 'รายได้ยอดขาย (โอน/พร้อมเพย์/บัตร)',
        ref: 'Dine-in / Takeaway',
        debit_code: incomeBankAccount.code, debit_name: incomeBankAccount.name,
        credit_code: '4101', credit_name: 'รายได้จากการขาย (Dine-in)',
        amount: electronic,
      })
    }
    if (grabNet > 0) {
      entries.push({
        id: `sales_grab_${s.date}`,
        date: s.date,
        type: 'sales',
        description: `รายได้ Grab (ยอดสุทธิ)`,
        ref: `รวม ${grabGross.toLocaleString('th-TH', { minimumFractionDigits: 2 })} หัก GP ${grabFee.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
        debit_code: grabBankAccount.code, debit_name: grabBankAccount.name,
        credit_code: '4102', credit_name: 'รายได้จากการขาย (Grab)',
        amount: grabNet,
      })
    }
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
    entries.push({
      id: a.id,
      date: a.purchase_date,
      type: 'asset',
      description: `ซื้อสินทรัพย์: ${a.name}`,
      ref: a.category || '',
      debit_code: '1501',
      debit_name: 'ที่ดิน อาคาร และอุปกรณ์',
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
