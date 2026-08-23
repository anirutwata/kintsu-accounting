export type UserRole = 'owner' | 'manager' | 'cashier' | 'purchasing'

export interface User {
  id: string
  name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Settings {
  id: number
  restaurant_name: string
  vat_rate_bps: number
  service_charge_bps: number
  grabfood_gp_bps: number
  telegram_bot_token?: string
  telegram_chat_id?: string
  income_bank_account_id?: string | null   // legacy
  grab_bank_account_id?: string | null
  fs_promptpay_bank_id?: string | null
  fs_company_transfer_bank_id?: string | null
  fs_credit_card_bank_id?: string | null
  pp_promptpay_bank_id?: string | null
  pp_company_transfer_bank_id?: string | null
  pp_credit_card_bank_id?: string | null
  updated_at: string
}

export interface Shift {
  id: string
  date: string
  shift_name: string
  status: 'open' | 'closed'
  float_satang: number
  closing_cash_satang: number | null
  cash_variance_satang: number | null
  closing_denominations: Record<string, number> | null
  opened_at: string
  closed_at: string | null
  opened_by: string | null
  closed_by: string | null
}

export interface Supplier {
  id: string
  name: string
  category: string
  contact_name: string | null
  phone: string | null
  credit_term_days: number
  is_active: boolean
}

export type ExpenseCategoryType = 'expense' | 'asset'

export type ExpenseCategory =
  // Asset
  | 'ส่วนต่อเติมอาคาร' | 'ระบบ' | 'อุปกรณ์ครัว' | 'อุปกรณ์ทั่วไปในร้านอาหาร' | 'สินทรัพย์อื่นๆ'
  // Expense
  | 'วัตถุดิบทางตรง-เนื้อวัว' | 'วัตถุดิบทางตรง-เนื้อหมู' | 'วัตถุดิบทางตรง-อื่นๆ'
  | 'บรรจุภัณฑ์' | 'วัสดุสิ้นเปลืองในครัว' | 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร'
  | 'เครื่องดื่ม' | 'Commission - Grab food' | 'ค่าขนส่ง'
  | 'เงินเดือนพนักงานประจำและสวัสดิการ' | 'เงินเดือน- part time'
  | 'ค่าเช่า' | 'ค่าบริการเช่าพื้นที่' | 'ค่าประกัน' | 'ค่าระบบต่างๆ'
  | 'ภาษีโรงเรือน' | 'ภาษีมูลค่าเพิ่ม' | 'ภาษีอื่นๆ' | 'ค่าบริการอื่นๆ'
  | 'ค่าน้ำ' | 'ค่าไฟ' | 'ค่าการตลาด' | 'ค่าซ่อมบำรุง' | 'ดอกเบี้ย' | 'เงินขาด/เกิน'

export type PaymentMethod = 'เงินสด' | 'โอนเงิน' | 'บัตรเครดิต' | 'เครดิต'

export interface Expense {
  id: string
  document_date: string   // วันที่เอกสาร/ใบแจ้งหนี้ — ใช้คำนวณ P&L
  date: string            // วันที่ชำระเงินจริง — ใช้กระทบยอดธนาคาร
  category: ExpenseCategory
  amount_satang: number
  vat_satang: number
  vat_inclusive: boolean
  wht_satang: number
  discount_satang: number
  total_satang: number
  payment_method: PaymentMethod
  bank_account_id: string | null
  transfer_time: string | null
  sender_name: string | null
  sender_bank: string | null
  sender_account: string | null
  recipient_name: string | null
  recipient_address: string | null
  is_paid: boolean
  slip_image_url: string | null
  ocr_data: OcrData | null
  receipt_image_urls: string[]
  note: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string | null
  updated_by_name: string | null
  is_deleted: boolean
  flowaccount_record_id: number | null
  flowaccount_document_serial: string | null
  flowaccount_synced_at: string | null
  items?: ExpenseItem[]
}

// Optional per-expense line items — when present, these (not expenses.category/
// amount_satang) are the source of truth for P&L cost breakdown and what gets synced
// to FlowAccount, letting one bill span multiple categories.
export interface ExpenseItem {
  id: string
  expense_id: string
  category: ExpenseCategory
  description: string
  quantity: number
  unit: string | null
  price_per_unit_satang: number
  total_satang: number
  sort_order: number
}

export interface OcrData {
  amount_satang: number
  date: string
  time: string
  ref_number: string
  sender_name: string
  sender_bank: string
  sender_account: string
  recipient: string
  recipient_bank: string
  confidence: number
}

export interface BankAccount {
  id: string
  bank_name: string
  account_number: string
  account_name: string
  is_active: boolean
  sort_order: number
  created_at: string
  flowaccount_bank_account_id: number | null
}

export interface PettyCash {
  id: string
  shift_id: string
  date: string
  opening_balance_satang: number
  closing_balance_satang: number | null
  total_expenses_satang: number
  status: 'open' | 'closed'
  opened_by: string | null
  closed_by: string | null
}

export interface PettyCashTransaction {
  id: string
  petty_cash_id: string
  time: string
  description: string
  amount_satang: number
  category: string
  receipt_image_url: string | null
  created_by: string | null
  created_by_name: string | null
}

export interface DailySales {
  id: string
  date: string
  dine_in_revenue_satang: number
  dine_in_covers: number
  dine_in_bills: number
  dine_in_service_charge_satang: number
  dine_in_vat_satang: number
  grabfood_gross_satang: number
  grabfood_gp_fee_satang: number
  grabfood_net_satang: number
  grabfood_orders: number
  grabfood_vat_satang: number
  takeaway_revenue_satang: number
  takeaway_orders: number
  takeaway_vat_satang: number
  void_count: number
  void_total_satang: number
  refund_count: number
  refund_total_satang: number
  total_gross_satang: number
  total_net_satang: number
  total_vat_satang: number
  source: string
  // Foodstory payment breakdown
  cash_satang: number
  promptpay_satang: number
  company_transfer_satang: number
  credit_card_satang: number
  sales_before_vat_satang: number
  vat_amount_satang: number
  rounding_satang: number
  discount_satang: number
  // Papaya POS
  papaya_revenue_satang: number
  papaya_covers: number
  papaya_bills: number
  papaya_sales_before_vat_satang: number
  papaya_vat_satang: number
  papaya_rounding_satang: number
  papaya_discount_satang: number
  papaya_cash_satang: number
  papaya_promptpay_satang: number
  papaya_company_transfer_satang: number
  papaya_credit_card_satang: number
  flowaccount_cash_record_id: number | null
  flowaccount_cash_document_serial: string | null
  flowaccount_cash_synced_at: string | null
  flowaccount_transfer_record_id: number | null
  flowaccount_transfer_document_serial: string | null
  flowaccount_transfer_synced_at: string | null
  flowaccount_credit_card_record_id: number | null
  flowaccount_credit_card_document_serial: string | null
  flowaccount_credit_card_synced_at: string | null
}

export interface VoidRefund {
  id: string
  date: string
  shift_id: string | null
  type: 'void' | 'refund'
  amount_satang: number
  reason: string
  reason_note: string | null
  pos_order_id: string | null
  approved_by: string | null
  created_by: string | null
  created_at: string
}

export interface MonthlyTarget {
  id: string
  month: string
  revenue_target_satang: number
  food_cost_target_bps: number
  labor_cost_target_bps: number
  net_profit_target_bps: number
}

export interface KPIResult {
  totalRevenueSatang: number
  foodCostSatang: number
  laborCostSatang: number
  grabGpCostSatang: number
  depreciationSatang: number
  otherExpensesSatang: number
  totalExpensesSatang: number
  grossProfitSatang: number
  netProfitSatang: number
  foodCostBps: number
  laborCostBps: number
  netProfitBps: number
  vatPayableSatang: number
  // vs target
  revenueAchievementBps: number
  foodCostVarianceBps: number
  netProfitVarianceBps: number
  // integration sources
  foodCostSource: 'kintsu_stock' | 'manual' | 'unavailable'
  laborCostSource: 'kintsu_hr' | 'manual' | 'unavailable'
}

export interface Asset {
  id: string
  name: string
  category: string
  purchase_date: string
  purchase_satang: number
  salvage_satang: number
  useful_life_months: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

export interface SessionUser {
  id: string
  name: string
  role: UserRole
}
