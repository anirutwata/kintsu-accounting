export interface PaymentSlipExpense {
  id: string
  date: string
  document_date: string
  recipient_name: string | null
  total_satang: number
  flowaccount_document_serial: string
  flowaccount_payment_slip_serial: string
  flowaccount_payment_channel: string | null
  flowaccount_reference: string | null
}

export interface PaymentSlipGroup {
  serial: string
  payment_date: string
  payment_channel: string | null
  total_satang: number
  expenses: PaymentSlipExpense[]
}

export function groupExpensesByPaymentSlip(expenses: PaymentSlipExpense[]): PaymentSlipGroup[] {
  const groups = new Map<string, PaymentSlipGroup>()
  for (const expense of expenses) {
    const serial = expense.flowaccount_payment_slip_serial
    const group = groups.get(serial) ?? {
      serial,
      payment_date: expense.date,
      payment_channel: expense.flowaccount_payment_channel,
      total_satang: 0,
      expenses: [],
    }
    group.total_satang += expense.total_satang
    group.expenses.push(expense)
    groups.set(serial, group)
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      expenses: group.expenses.sort((a, b) => a.document_date.localeCompare(b.document_date)),
    }))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.serial.localeCompare(a.serial))
}
