-- Fix a typo in migration 024: the WHERE clause used 'สินค้าสำเร็จรูป' but the actual category
-- name includes the parenthetical suffix, so this one row was silently skipped.
UPDATE expense_categories SET flowaccount_system_code = 1008, flowaccount_category_id = 199500
WHERE name = 'สินค้าสำเร็จรูป (น้ำจิ้ม/ซอส/ผักดอง)' AND category_type = 'expense';
