-- Add catch-all bank account code 1199 (safe fallback, never used by sequential sort_order)
INSERT INTO accounts (code, name, type)
VALUES ('1199', 'เงินฝากธนาคารอื่น', 'asset')
ON CONFLICT (code) DO NOTHING;
