-- discount_satang: document-level discount (baht), deducted from the raw item-line
-- total before VAT — mirrors FlowAccount's own discountAmount/totalAfterDiscount
-- fields. Does NOT affect amount_satang (unchanged, still the raw per-item cost basis
-- used for P&L food/labor/other-cost attribution) — only total_satang (the actual
-- payable/grand-total figure) and what gets synced to FlowAccount as grandTotal.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS discount_satang integer NOT NULL DEFAULT 0;
