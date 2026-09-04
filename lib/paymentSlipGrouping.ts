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
  status: 'pending' | 'awaiting_flowaccount' | 'paid' | 'cancelled'
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

function comparePaymentSlipSerialDesc(left: string, right: string): number {
  const leftNumber = /^PAY(\d+)$/i.exec(left)?.[1]
  const rightNumber = /^PAY(\d+)$/i.exec(right)?.[1]
  if (leftNumber && rightNumber) {
    const leftNormalized = leftNumber.replace(/^0+(?=\d)/, '')
    const rightNormalized = rightNumber.replace(/^0+(?=\d)/, '')
    if (leftNormalized.length !== rightNormalized.length) {
      return rightNormalized.length - leftNormalized.length
    }
    if (leftNormalized !== rightNormalized) return rightNormalized > leftNormalized ? 1 : -1
  }
  return right.localeCompare(left)
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
    // A cancelled EXP still belongs to its PAY for reconciliation — keep it in the
    // group's expense list, just leave it out of the amounts so it doesn't inflate
    // the actual bank transfer.
    if (expense.flowaccount_payment_status !== 'cancelled') {
      group.gross_total_satang += expense.total_satang
      group.total_satang += expense.total_satang - expense.wht_satang
    }
    if (expense.flowaccount_payment_status === 'pendingPayment') group.status = 'pending'
    group.expenses.push(expense)
    group.local_payment = localPaymentBySerial.get(serial) ?? null
    groups.set(serial, group)
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      status: group.expenses.every(expense => expense.flowaccount_payment_status === 'cancelled')
        ? 'cancelled' as const
        : group.status === 'pending' && group.local_payment ? 'awaiting_flowaccount' as const : group.status,
      expenses: group.expenses.sort((a, b) => a.document_date.localeCompare(b.document_date)),
    }))
    .sort((a, b) => comparePaymentSlipSerialDesc(a.serial, b.serial))
}
