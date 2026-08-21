-- Remap all Kintsu expense categories to the FlowAccount accounting-view chart of
-- accounts (GET /expenses/categories/accounting, 138 entries) instead of the curated
-- business-category list (~40 entries) that lib/flowaccount.ts used to read from.
-- Confirmed with FlowAccount support (2026-08-20) and verified live against Production
-- that posting works via creditId/debitId even outside the curated business list.
--
-- 5 ingredient/COGS categories (เครื่องดื่ม, เนื้อวัว, เนื้อหมู, อื่นๆ, บรรจุภัณฑ์) that
-- previously shared one generic account (51111.01) now post to their own exact account.
-- 2 previously-undecided categories (วัสดุสิ้นเปลืองในครัว/ทั่วไปในร้านอาหาร) now have
-- exact matches too. ภาษีโรงเรือน gets its own account instead of the generic ภาษีอื่นๆ.

UPDATE expense_categories SET
  flowaccount_system_code = 1035,
  flowaccount_category_id = 199526,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573443,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่านายหน้าและส่วนแบ่งการขาย'
WHERE name = 'Commission - Grab food' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1001,
  flowaccount_category_id = 199493,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573472,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'การตลาดและโฆษณา'
WHERE name = 'ค่าการตลาด' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1006,
  flowaccount_category_id = 199498,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573440,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าขนส่งสินค้า/ลอจิสติกส์'
WHERE name = 'ค่าขนส่ง' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1028,
  flowaccount_category_id = 199519,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573485,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าเช่า'
WHERE name = 'ค่าเช่า' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1036,
  flowaccount_category_id = 199527,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573486,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ซ่อมแซมบำรุงรักษา'
WHERE name = 'ค่าซ่อมบำรุง' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1040,
  flowaccount_category_id = 199534,
  flowaccount_credit_id = 209573558,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573578,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าน้ำ'
WHERE name = 'ค่าน้ำ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1028,
  flowaccount_category_id = 199519,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573485,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าเช่า'
WHERE name = 'ค่าบริการเช่าพื้นที่' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1020,
  flowaccount_category_id = 199511,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573505,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าจ้าง/บริการ'
WHERE name = 'ค่าบริการอื่นๆ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1030,
  flowaccount_category_id = 199521,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573630,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'เบี้ยประกัน'
WHERE name = 'ค่าประกัน' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1041,
  flowaccount_category_id = 199530,
  flowaccount_credit_id = 209573558,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573577,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าไฟ'
WHERE name = 'ค่าไฟ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1015,
  flowaccount_category_id = 199507,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573501,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'โปรแกรม/ซอฟท์แวร์/แอพลิเคชั่น'
WHERE name = 'ค่าระบบต่างๆ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573320,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 444013888,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'เครื่องดื่ม'
WHERE name = 'เครื่องดื่ม' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1033,
  flowaccount_category_id = 199524,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573511,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'เบ็ดเตล็ด'
WHERE name = 'เงินขาด/เกิน' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573635,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 442963948,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'เงินเดือน-Part time'
WHERE name = 'เงินเดือน- part time' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1023,
  flowaccount_category_id = 199514,
  flowaccount_credit_id = 209573635,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573450,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'เงินเดือน/สวัสดิการ'
WHERE name = 'เงินเดือนพนักงานประจำและสวัสดิการ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1037,
  flowaccount_category_id = 199528,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573519,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ดอกเบี้ยเงินกู้ยืม'
WHERE name = 'ดอกเบี้ย' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 448362904,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'บรรจุภัณฑ์'
WHERE name = 'บรรจุภัณฑ์' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1043,
  flowaccount_category_id = 541035,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573260,
  flowaccount_debit_category = 1,
  flowaccount_category_name = 'เฟอร์นิเจอร์และตกแต่งสำนักงาน'
WHERE name = 'เฟอร์นิเจอร์และของตกแต่ง' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1032,
  flowaccount_category_id = 199523,
  flowaccount_credit_id = 209573376,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573493,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ภาษีและทะเบียน'
WHERE name = 'ภาษีมูลค่าเพิ่ม' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573376,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573490,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าภาษีโรงเรือนและบำรุงท้องที่'
WHERE name = 'ภาษีโรงเรือน' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1032,
  flowaccount_category_id = 199523,
  flowaccount_credit_id = 209573376,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573493,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ภาษีและทะเบียน'
WHERE name = 'ภาษีอื่นๆ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1015,
  flowaccount_category_id = 199507,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573501,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'โปรแกรม/ซอฟท์แวร์/แอพลิเคชั่น'
WHERE name = 'ระบบ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573320,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 449556680,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'วัตถุดิบทางตรง-เนื้อวัว'
WHERE name = 'วัตถุดิบทางตรง-เนื้อวัว' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573320,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 449556681,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'วัตถุดิบทางตรง-เนื้อหมู'
WHERE name = 'วัตถุดิบทางตรง-เนื้อหมู' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573320,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 449556684,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'วัตถุดิบทางตรง-อื่นๆ'
WHERE name = 'วัตถุดิบทางตรง-อื่นๆ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 449558024,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร'
WHERE name = 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 449558023,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'วัสดุสิ้นเปลืองในครัว'
WHERE name = 'วัสดุสิ้นเปลืองในครัว' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573271,
  flowaccount_debit_category = 1,
  flowaccount_category_name = 'สิทธิการเช่า/สิทธิการใช้ทรัพย์สิน'
WHERE name = 'ส่วนต่อเติมอาคาร' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1013,
  flowaccount_category_id = 199505,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573258,
  flowaccount_debit_category = 1,
  flowaccount_category_name = 'เฟอร์นิเจอร์/อุปกรณ์สำนักงาน'
WHERE name = 'สินทรัพย์อื่นๆ' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1013,
  flowaccount_category_id = 199505,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573258,
  flowaccount_debit_category = 1,
  flowaccount_category_name = 'เฟอร์นิเจอร์/อุปกรณ์สำนักงาน'
WHERE name = 'อุปกรณ์ครัว' AND category_type = 'expense';

UPDATE expense_categories SET
  flowaccount_system_code = 1013,
  flowaccount_category_id = 199505,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573258,
  flowaccount_debit_category = 1,
  flowaccount_category_name = 'เฟอร์นิเจอร์/อุปกรณ์สำนักงาน'
WHERE name = 'อุปกรณ์ทั่วไปในร้านอาหาร' AND category_type = 'expense';