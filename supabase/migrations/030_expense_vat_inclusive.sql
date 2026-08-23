-- vat_inclusive: whether vat_satang is already included in amount_satang (retail
-- receipt style, e.g. shelf price incl. VAT) or is an add-on that must be added to
-- get the real payable total (formal tax-invoice style, e.g. ใบวางบิล/ใบแจ้งหนี้ where
-- items are priced ex-VAT and VAT 7% is a separate line). Default true preserves
-- existing behavior for all rows recorded before this column existed.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_inclusive boolean NOT NULL DEFAULT true;
