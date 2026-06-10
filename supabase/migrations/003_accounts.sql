-- Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  parent_code TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: standard accounts for Kintsu restaurant
INSERT INTO accounts (code, name, type) VALUES
-- สินทรัพย์
('1101', 'เงินสด',                       'asset'),
('1102', 'เงินฝากธนาคาร TTB',             'asset'),
('1103', 'เงินฝากธนาคาร KBANK',           'asset'),
('1104', 'เงินฝากธนาคารอื่น',             'asset'),
('1201', 'ลูกหนี้การค้า',                 'asset'),
('1301', 'สินค้าคงคลัง',                  'asset'),
('1401', 'ค่าใช้จ่ายล่วงหน้า',            'asset'),
('1501', 'ที่ดิน อาคาร และอุปกรณ์',        'asset'),
('1502', 'ค่าเสื่อมราคาสะสม',             'asset'),
-- หนี้สิน
('2101', 'เจ้าหนี้การค้า',                'liability'),
('2201', 'ค่าใช้จ่ายค้างจ่าย',            'liability'),
('2301', 'เงินกู้ยืมระยะสั้น',             'liability'),
('2401', 'เงินกู้ยืมระยะยาว',             'liability'),
('2501', 'ภาษีมูลค่าเพิ่มค้างจ่าย',       'liability'),
-- ส่วนของเจ้าของ
('3101', 'ทุนเจ้าของ',                    'equity'),
('3201', 'กำไรสะสม',                      'equity'),
('3301', 'ถอนใช้ส่วนตัว',                 'equity'),
-- รายได้
('4101', 'รายได้จากการขาย (Dine-in)',     'income'),
('4102', 'รายได้จากการขาย (Grab)',        'income'),
('4103', 'รายได้จากการขาย (Takeaway)',    'income'),
('4201', 'รายได้อื่น',                    'income'),
-- ค่าใช้จ่าย
('5101', 'ต้นทุนวัตถุดิบ',                'expense'),
('5201', 'เงินเดือนและค่าแรง',            'expense'),
('5301', 'ค่าเช่า',                       'expense'),
('5302', 'ค่าสาธารณูปโภค',               'expense'),
('5303', 'ค่าซ่อมแซมและบำรุงรักษา',      'expense'),
('5304', 'ค่าบรรจุภัณฑ์และวัสดุสิ้นเปลือง','expense'),
('5305', 'ค่าใช้จ่ายทางการตลาด',         'expense'),
('5401', 'ค่าเสื่อมราคา',                 'expense'),
('5501', 'ค่าธรรมเนียมธนาคาร',           'expense'),
('5502', 'ค่าธรรมเนียม Grab (30%)',       'expense'),
('5601', 'ค่าใช้จ่ายทั่วไป',             'expense')
ON CONFLICT (code) DO NOTHING;
