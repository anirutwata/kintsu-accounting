export type UserRole = 'owner' | 'manager' | 'cashier'

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

export type ExpenseCategory =
  | 'วัตถุดิบ' | 'ค่าแรง' | 'ค่าเช่า' | 'ค่าไฟ/แก๊ส'
  | 'ค่าการตลาด' | 'ค่าซ่อมบำรุง' | 'วัสดุสิ้นเปลือง' | 'อื่นๆ'

export type PaymentMethod = 'เงินสด' | 'โอนเงิน' | 'บัตรเครดิต' | 'เครดิต'

export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  amount_satang: number
  total_satang: number
  payment_method: PaymentMethod
  bank_account_id: string | null
  transfer_time: string | null
  sender_name: string | null
  sender_bank: string | null
  sender_account: string | null
  recipient_name: string | null
  is_paid: boolean
  slip_image_url: string | null
  ocr_data: OcrData | null
  receipt_image_urls: string[]
  note: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string | null
  is_deleted: boolean
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

export interface SessionUser {
  id: string
  name: string
  role: UserRole
}
