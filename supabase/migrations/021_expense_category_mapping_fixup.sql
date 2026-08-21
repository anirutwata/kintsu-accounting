-- Follow-up to 020: fixes 4 categories that the first migration's WHERE name = ...
-- clauses missed because the live category names differ from the 2026-08-19 xlsx
-- snapshot (GP - Grab food, เงินเดือน ค่าแรง) or weren't in that snapshot at all
-- (ค่าอาหารและเครื่องดื่มพนักงาน, วัตถุดิบทางตรง-ผัก — both have exact FlowAccount accounts).

UPDATE expense_categories SET
  flowaccount_system_code = 1035,
  flowaccount_category_id = 199526,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573443,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่านายหน้าและส่วนแบ่งการขาย'
WHERE name = 'GP - Grab food' AND category_type = 'expense';

-- name = exact match failed here (live value carries hidden whitespace not present
-- in the 2026-08-19 xlsx snapshot) — LIKE matches regardless of leading/trailing space.
UPDATE expense_categories SET
  flowaccount_system_code = 1023,
  flowaccount_category_id = 199514,
  flowaccount_credit_id = 209573635,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573450,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'เงินเดือน ค่าแรง'
WHERE category_type = 'expense' AND name LIKE '%เงินเดือน%ค่าแรง%';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573347,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 209573463,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'ค่าอาหารและเครื่องดื่มพนักงาน'
WHERE category_type = 'expense' AND name LIKE '%อาหารและเครื่องดื่มพนักงาน%';

UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573320,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 449556682,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'วัตถุดิบทางตรง-ผัก'
WHERE name = 'วัตถุดิบทางตรง-ผัก' AND category_type = 'expense';

-- Correction: "GP - Grab food" was pointed at the generic ค่านายหน้าและส่วนแบ่งการขาย (52050)
-- commission account, but FlowAccount already has a dedicated account for exactly this
-- (52994.01 "GP - Grab Food") — missed it the first time despite having it in the full
-- category dump; use the dedicated account instead.
UPDATE expense_categories SET
  flowaccount_system_code = NULL,
  flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328,
  flowaccount_credit_category = 2,
  flowaccount_debit_id = 449558918,
  flowaccount_debit_category = 5,
  flowaccount_category_name = 'GP - Grab Food'
WHERE category_type = 'expense' AND name LIKE '%GP%Grab%';

-- User created 5 dedicated accounts in FlowAccount so nothing shares a generic bucket
-- anymore: อุปกรณ์ครัว/อุปกรณ์ทั่วไปในร้านอาหาร (previously both on 12611), ระบบ (previously
-- shared with ค่าระบบต่างๆ on 53113), สินทรัพย์อื่นๆ (previously on 12611), ภาษีมูลค่าเพิ่ม
-- (previously shared with ภาษีอื่นๆ on 53739). Verified live against FlowAccount (2026-08-21).
UPDATE expense_categories SET
  flowaccount_system_code = NULL, flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328, flowaccount_credit_category = 2,
  flowaccount_debit_id = 449928444, flowaccount_debit_category = 1,
  flowaccount_category_name = 'อุปกรณ์ครัว'
WHERE category_type = 'expense' AND name LIKE '%อุปกรณ์ครัว%';

UPDATE expense_categories SET
  flowaccount_system_code = NULL, flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328, flowaccount_credit_category = 2,
  flowaccount_debit_id = 449928891, flowaccount_debit_category = 1,
  flowaccount_category_name = 'อุปกรณ์ทั่วไปในร้านอาหาร'
WHERE category_type = 'expense' AND name LIKE '%อุปกรณ์ทั่วไปในร้านอาหาร%';

UPDATE expense_categories SET
  flowaccount_system_code = NULL, flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328, flowaccount_credit_category = 2,
  flowaccount_debit_id = 449928893, flowaccount_debit_category = 1,
  flowaccount_category_name = 'ระบบ'
WHERE category_type = 'expense' AND name = 'ระบบ';

UPDATE expense_categories SET
  flowaccount_system_code = NULL, flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573328, flowaccount_credit_category = 2,
  flowaccount_debit_id = 449928892, flowaccount_debit_category = 1,
  flowaccount_category_name = 'สินทรัพย์อื่นๆ'
WHERE category_type = 'expense' AND name LIKE '%สินทรัพย์อื่นๆ%';

UPDATE expense_categories SET
  flowaccount_system_code = NULL, flowaccount_category_id = NULL,
  flowaccount_credit_id = 209573376, flowaccount_credit_category = 2,
  flowaccount_debit_id = 449928894, flowaccount_debit_category = 5,
  flowaccount_category_name = 'ภาษีมูลค่าเพิ่ม'
WHERE category_type = 'expense' AND name LIKE '%ภาษีมูลค่าเพิ่ม%';
