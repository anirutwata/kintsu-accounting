export interface PaymentSlipExpense {
  id: string
  date: string
  document_date: string
  recipient_name: string | null
  total_satang: number
  wht_satang: number
  flowaccount_document_serial: string
  flowaccount_payment_slip_serial: string
  flowaccount_payment_channel: string | null
  flowaccount_reference: string | null
  flowaccount_payment_status: string | null
}

export interface PaymentSlipGroup {
  serial: string
  payment_date: string
  payment_channel: string | null
  total_satang: number
  gross_total_satang: number
  status: 'pending' | 'awaiting_flowaccount' | 'paid'
  local_payment: PaymentSlipLocalPayment | null
  expenses: PaymentSlipExpense[]
}

export interface PaymentSlipLocalPayment {
  id: string
  payment_slip_serial: string
  payment_date: string
  bank_account_id: string
  bank_name: string
  account_number: string
  amount_satang: number
  slip_image_url: string
  note: string | null
  recorded_by_name: string | null
}

export function groupExpensesByPaymentSlip(
  expenses: PaymentSlipExpense[],
  localPayments: PaymentSlipLocalPayment[] = [],
): PaymentSlipGroup[] {
  const localPaymentBySerial = new Map(localPayments.map(payment => [payment.payment_slip_serial, payment]))
  const groups = new Map<string, PaymentSlipGroup>()
  for (const expense of expenses) {
    const serial = expense.flowaccount_payment_slip_serial
    const group = groups.get(serial) ?? {
      serial,
      payment_date: expense.date,
      payment_channel: expense.flowaccount_payment_channel,
      total_satang: 0,
      gross_total_satang: 0,
      status: 'paid',
      local_payment: null,
      expenses: [],
    }
    group.gross_total_satang += expense.total_satang
    group.total_satang += expense.total_satang - expense.wht_satang
    if (expense.flowaccount_payment_status === 'pendingPayment') group.status = 'pending'
    group.expenses.push(expense)
    group.local_payment = localPaymentBySerial.get(serial) ?? null
    groups.set(serial, group)
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      status: group.status === 'pending' && group.local_payment ? 'awaiting_flowaccount' as const : group.status,
      expenses: group.expenses.sort((a, b) => a.document_date.localeCompare(b.document_date)),
    }))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.serial.localeCompare(a.serial))
}
