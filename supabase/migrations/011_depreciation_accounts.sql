-- Accounts for depreciation
INSERT INTO accounts (code, name, type) VALUES
  ('1550', 'ค่าเสื่อมราคาสะสม', 'asset'),
  ('5901', 'ค่าเสื่อมราคา', 'expense')
ON CONFLICT (code) DO NOTHING;
