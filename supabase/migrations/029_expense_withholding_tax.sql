-- Tracks withholding tax already shown on a vendor's bill (e.g. their invoice
-- already nets "ยอดชำระ" = grand total - หัก ณ ที่จ่าย). Same role as
-- vat_satang: a portion of amount_satang, not an addition to it. Does NOT yet
-- create the actual WithholdingTaxDocument in FlowAccount — that needs a
-- separate design (income type + individual/juristic per vendor).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS wht_satang integer NOT NULL DEFAULT 0;
