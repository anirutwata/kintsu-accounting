-- Migration 019: let the customer declare นิติบุคคล (juristic) vs บุคคลธรรมดา (individual)
-- on the public tax-invoice request form — passed through to FlowAccount's contactGroup field.
ALTER TABLE tax_invoice_requests ADD COLUMN IF NOT EXISTS contact_group text
  CHECK (contact_group IN ('individual', 'juristic'));
