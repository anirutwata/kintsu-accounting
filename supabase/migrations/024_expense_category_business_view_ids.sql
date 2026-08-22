-- FlowAccount's POST /expenses requires systemCode + categoryId (business category) on every
-- line item — confirmed via the official OpenAPI spec (ExpenseProductItem.required includes
-- both), not just a curated-category convenience. 14 expense categories were mapped straight to
-- a custom chart-of-account debitId/creditId with no business category attached, so every real
-- sync for them has been failing with "Item requires SystemCode","Item requires CategoryId"
-- since day one (confirmed: only "ค่าน้ำ" has ever actually synced in production).
--
-- Live-tested against Production (two throwaway ฿1 documents, since voided) that systemCode/
-- categoryId is ONLY a validation gate — creditId/debitId post to exactly what's sent, fully
-- independent of the category's own default account, even when deliberately mismatched. So this
-- migration only fills systemCode/categoryId with the closest-matching FlowAccount business
-- category; flowaccount_debit_id/flowaccount_credit_id (the actual posting accounts) are
-- untouched.

UPDATE expense_categories SET flowaccount_system_code = 1035, flowaccount_category_id = 199526
WHERE name = 'GP - Grab food' AND category_type = 'expense';

UPDATE expense_categories SET flowaccount_system_code = 1027, flowaccount_category_id = 199518
WHERE name = 'ค่าอาหารและเครื่องดื่มพนักงาน' AND category_type = 'expense';

UPDATE expense_categories SET flowaccount_system_code = 1008, flowaccount_category_id = 199500
WHERE name IN ('เครื่องดื่ม', 'วัตถุดิบทางตรง-เนื้อวัว', 'วัตถุดิบทางตรง-เนื้อหมู', 'วัตถุดิบทางตรง-ผัก', 'วัตถุดิบทางตรง-อื่นๆ', 'สินค้าสำเร็จรูป')
  AND category_type = 'expense';

UPDATE expense_categories SET flowaccount_system_code = 1024, flowaccount_category_id = 199515
WHERE name = 'เงินเดือน- part time' AND category_type = 'expense';

UPDATE expense_categories SET flowaccount_system_code = 1007, flowaccount_category_id = 199499
WHERE name IN ('บรรจุภัณฑ์', 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร', 'วัสดุสิ้นเปลืองในครัว')
  AND category_type = 'expense';

UPDATE expense_categories SET flowaccount_system_code = 1032, flowaccount_category_id = 199523
WHERE name IN ('ภาษีมูลค่าเพิ่ม', 'ภาษีโรงเรือน') AND category_type = 'expense';
