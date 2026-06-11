-- Manual journal entries for adjusting/closing entries
CREATE TABLE IF NOT EXISTS manual_journal_entries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date          date NOT NULL,
  description   text NOT NULL,
  reference     text DEFAULT '',
  debit_code    text NOT NULL,
  debit_name    text NOT NULL,
  credit_code   text NOT NULL,
  credit_name   text NOT NULL,
  amount_satang bigint NOT NULL CHECK (amount_satang > 0),
  created_at    timestamptz DEFAULT now(),
  deleted_at    timestamptz
);

ALTER TABLE manual_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON manual_journal_entries FOR ALL USING (true) WITH CHECK (true);
