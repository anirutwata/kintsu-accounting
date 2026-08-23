-- Lets each local bank account be mapped to the matching FlowAccount bank
-- channel (from GET /bank-channel/bank-accounts). Column added now while the
-- payment-channel wiring is fresh, but NOT yet used to auto-pay "โอนเงิน"
-- expenses — see lib/expenseSync.ts's resolvePaymentChannel for why (conflicts
-- with the real batched ใบเตรียมจ่าย/ใบสำคัญจ่าย Payment Voucher workflow;
-- needs a workflow decision first).
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS flowaccount_bank_account_id integer;
