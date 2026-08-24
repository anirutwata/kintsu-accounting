-- Migration 035: auditable PAY reconciliation and historical account aliases.

alter table expense_items
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

create table if not exists flowaccount_expense_category_aliases (
  debit_id bigint primary key,
  debit_code text,
  debit_name text,
  category text not null,
  created_at timestamptz not null default now()
);

insert into flowaccount_expense_category_aliases (debit_id, debit_code, debit_name, category) values
  (444011608, '51121.01', 'ซื้อวัตถุดิบประกอบอาหาร', 'วัตถุดิบทางตรง-อื่นๆ'),
  (444013888, '51121.02', 'เครื่องดื่ม', 'เครื่องดื่ม'),
  (444013892, '51121.03', 'เครื่องดื่ม - แอลกอฮอลล์', 'เครื่องดื่ม'),
  (218906633, '51122', 'ซื้อวัสดุสิ้นเปลือง', 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร'),
  (209573422, '51111.01', 'ซื้อสินค้า', 'วัตถุดิบทางตรง-อื่นๆ'),
  (209573481, '53032.03', 'เครื่องเขียน/วัสดุสิ้นเปลือง', 'วัสดุสิ้นเปลืองทั่วไปในร้านอาหาร')
on conflict (debit_id) do update set
  debit_code = excluded.debit_code,
  debit_name = excluded.debit_name,
  category = excluded.category;

alter table flowaccount_expense_category_aliases disable row level security;
