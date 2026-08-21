-- Display-name-only fix: flowaccount_category_name was set to the curated
-- 'business category' friendly label (e.g. ภาษีอื่นๆ showed 'ภาษีและทะเบียน')
-- instead of the real GL account name (ค่าภาษีอื่นๆ). Purely cosmetic — does not
-- touch flowaccount_debit_id/credit_id, so nothing about actual posting changes.

UPDATE expense_categories SET flowaccount_category_name = 'GP - Grab Food' WHERE category_type = 'expense' AND name LIKE '%GP - Grab food%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าใช้จ่ายด้านโฆษณาและการตลาดอื่นๆ' WHERE category_type = 'expense' AND name LIKE '%ค่าการตลาด%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าขนส่ง' WHERE category_type = 'expense' AND name LIKE '%ค่าขนส่ง%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าเช่า' WHERE category_type = 'expense' AND name LIKE '%ค่าเช่า%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าซ่อมแซมและบำรุงรักษา' WHERE category_type = 'expense' AND name LIKE '%ค่าซ่อมบำรุง%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าน้ำประปา' WHERE category_type = 'expense' AND name LIKE '%ค่าน้ำ%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าเช่า' WHERE category_type = 'expense' AND name LIKE '%ค่าบริการเช่าพื้นที่%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าบริการอื่นๆ' WHERE category_type = 'expense' AND name LIKE '%ค่าบริการอื่นๆ%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าเบี้ยประกันภัยอื่นๆ' WHERE category_type = 'expense' AND name LIKE '%ค่าประกัน%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าไฟฟ้า' WHERE category_type = 'expense' AND name LIKE '%ค่าไฟ%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าโปรแกรมและแอปพลิเคชัน' WHERE category_type = 'expense' AND name LIKE '%ค่าระบบต่างๆ%';
UPDATE expense_categories SET flowaccount_category_name = 'เครื่องดื่ม' WHERE category_type = 'expense' AND name LIKE '%เครื่องดื่ม%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าใช้จ่ายเบ็ดเตล็ด' WHERE category_type = 'expense' AND name LIKE '%เงินขาด/เกิน%';
UPDATE expense_categories SET flowaccount_category_name = 'เงินเดือน-Part time' WHERE category_type = 'expense' AND name LIKE '%เงินเดือน- part time%';
UPDATE expense_categories SET flowaccount_category_name = 'เงินเดือน ค่าแรง' WHERE category_type = 'expense' AND name LIKE '%เงินเดือน ค่าแรง%';
UPDATE expense_categories SET flowaccount_category_name = 'ดอกเบี้ยจ่าย' WHERE category_type = 'expense' AND name LIKE '%ดอกเบี้ย%';
UPDATE expense_categories SET flowaccount_category_name = 'บรรจุภัณฑ์' WHERE category_type = 'expense' AND name LIKE '%บรรจุภัณฑ์%';
UPDATE expense_categories SET flowaccount_category_name = 'เครื่องตกแต่งสำนักงาน' WHERE category_type = 'expense' AND name LIKE '%เฟอร์นิเจอร์และของตกแต่ง%';
UPDATE expense_categories SET flowaccount_category_name = 'ภาษีมูลค่าเพิ่ม' WHERE category_type = 'expense' AND name LIKE '%ภาษีมูลค่าเพิ่ม%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าภาษีโรงเรือนและบำรุงท้องที่' WHERE category_type = 'expense' AND name LIKE '%ภาษีโรงเรือน%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าภาษีอื่นๆ' WHERE category_type = 'expense' AND name LIKE '%ภาษีอื่นๆ%';
UPDATE expense_categories SET flowaccount_category_name = 'วัตถุดิบทางตรง-เนื้อวัว' WHERE category_type = 'expense' AND name LIKE '%วัตถุดิบทางตรง-เนื้อวัว%';
UPDATE expense_categories SET flowaccount_category_name = 'วัตถุดิบทางตรง-เนื้อหมู' WHERE category_type = 'expense' AND name LIKE '%วัตถุดิบทางตรง-เนื้อหมู%';
UPDATE expense_categories SET flowaccount_category_name = 'วัตถุดิบทางตรง-อื่นๆ' WHERE category_type = 'expense' AND name LIKE '%วัตถุดิบทางตรง-อื่นๆ%';
UPDATE expense_categories SET flowaccount_category_name = 'วัตถุดิบทางตรง-ผัก' WHERE category_type = 'expense' AND name LIKE '%วัตถุดิบทางตรง-ผัก%';
UPDATE expense_categories SET flowaccount_category_name = 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร' WHERE category_type = 'expense' AND name LIKE '%วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร%';
UPDATE expense_categories SET flowaccount_category_name = 'วัสดุสิ้นเปลืองในครัว' WHERE category_type = 'expense' AND name LIKE '%วัสดุสิ้นเปลืองในครัว%';
UPDATE expense_categories SET flowaccount_category_name = 'สิทธิการเช่า/สิทธิการใช้ทรัพย์สิน' WHERE category_type = 'expense' AND name LIKE '%ส่วนต่อเติมอาคาร%';
UPDATE expense_categories SET flowaccount_category_name = 'สินทรัพย์อื่นๆ' WHERE category_type = 'expense' AND name LIKE '%สินทรัพย์อื่นๆ%';
UPDATE expense_categories SET flowaccount_category_name = 'อุปกรณ์ครัว' WHERE category_type = 'expense' AND name LIKE '%อุปกรณ์ครัว%';
UPDATE expense_categories SET flowaccount_category_name = 'อุปกรณ์ทั่วไปในร้านอาหาร' WHERE category_type = 'expense' AND name LIKE '%อุปกรณ์ทั่วไปในร้านอาหาร%';
UPDATE expense_categories SET flowaccount_category_name = 'ค่าอาหารและเครื่องดื่มพนักงาน' WHERE category_type = 'expense' AND name LIKE '%ค่าอาหารและเครื่องดื่มพนักงาน%';
UPDATE expense_categories SET flowaccount_category_name = 'ระบบ' WHERE category_type = 'expense' AND name = 'ระบบ';
-- New 28th category added via the app UI after the initial 27-category mapping —
-- user created a dedicated FlowAccount account for it (51127).
UPDATE expense_categories SET
  flowaccount_system_code = NULL, flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573320, flowaccount_credit_category = 2,
  flowaccount_debit_id = 449929344, flowaccount_debit_category = 5,
  flowaccount_category_name = 'สินค้าสำเร็จรูป (น้ำจิ้ม/ซอส/ผักดอง)'
WHERE category_type = 'expense' AND name LIKE '%สินค้าสำเร็จรูป%';
