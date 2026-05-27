-- KINTSU Yakiniku Accounting System
-- Migration 001: Core Schema
-- All monetary values stored as integers (satang = สตางค์)
-- 1 baht = 100 satang, e.g. ฿1,234.50 = 123450

-- ─── Users (PIN login) ───────────────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Settings ────────────────────────────────────────────────────────────────
create table if not exists settings (
  id integer primary key default 1 check (id = 1), -- singleton row
  restaurant_name text not null default 'Kintsu Yakiniku',
  vat_rate_bps integer not null default 700,          -- 700 = 7.00%
  service_charge_bps integer not null default 1000,   -- 1000 = 10.00%
  grabfood_gp_bps integer not null default 3000,      -- 3000 = 30.00%
  telegram_bot_token text,
  telegram_chat_id text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- ─── Shifts ──────────────────────────────────────────────────────────────────
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_name text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  float_satang integer not null default 0,            -- เงินทอนเริ่มต้น
  closing_cash_satang integer,                        -- เงินที่นับจริงตอนปิดกะ
  cash_variance_satang integer,                       -- ผลต่าง (นับได้ - ควรมี)
  closing_denominations jsonb,                        -- { "100000": 5, "50000": 3, ... }
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references users(id),
  closed_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists shifts_date_idx on shifts(date desc);
create index if not exists shifts_status_idx on shifts(status);

-- ─── Suppliers ───────────────────────────────────────────────────────────────
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'อื่นๆ'
    check (category in ('เนื้อ','ผัก','ซอส/เครื่องปรุง','เครื่องดื่ม','วัสดุสิ้นเปลือง','อื่นๆ')),
  contact_name text,
  phone text,
  credit_term_days integer not null default 0,        -- 0=เงินสด, 7/15/30
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Expenses ────────────────────────────────────────────────────────────────
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_id uuid references shifts(id),
  category text not null
    check (category in ('วัตถุดิบ','ค่าแรง','ค่าเช่า','ค่าไฟ/แก๊ส','ค่าการตลาด','ค่าซ่อมบำรุง','วัสดุสิ้นเปลือง','อื่นๆ')),
  sub_category text,
  supplier_id uuid references suppliers(id),
  amount_satang integer not null check (amount_satang > 0),
  vat_satang integer not null default 0,
  total_satang integer not null,
  payment_method text not null default 'เงินสด'
    check (payment_method in ('เงินสด','โอนเงิน','บัตรเครดิต','เครดิต')),
  credit_due_date date,
  is_paid boolean not null default true,
  slip_image_url text,
  slip_hash text,                                     -- MD5 hash to prevent duplicate OCR
  ocr_data jsonb,                                     -- { amount, date, ref_number, bank, confidence }
  note text,
  -- Audit trail
  created_by uuid references users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references users(id),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references users(id)
);

create index if not exists expenses_date_idx on expenses(date desc);
create index if not exists expenses_shift_idx on expenses(shift_id);
create index if not exists expenses_category_idx on expenses(category);
create index if not exists expenses_is_paid_idx on expenses(is_paid) where not is_deleted;

-- ─── Petty Cash (one record per shift) ───────────────────────────────────────
create table if not exists petty_cash (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id) unique,
  date date not null,
  opening_balance_satang integer not null default 0,
  closing_balance_satang integer,
  total_expenses_satang integer not null default 0,   -- sum of transactions
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by uuid references users(id),
  closed_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ─── Petty Cash Transactions (subcollection pattern via FK) ──────────────────
create table if not exists petty_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  petty_cash_id uuid not null references petty_cash(id) on delete cascade,
  time timestamptz not null default now(),
  description text not null,
  amount_satang integer not null check (amount_satang > 0),
  category text not null,
  receipt_image_url text,
  created_by uuid references users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists pct_petty_cash_id_idx on petty_cash_transactions(petty_cash_id);

-- ─── Daily Sales ─────────────────────────────────────────────────────────────
create table if not exists daily_sales (
  id text primary key,                                -- 'YYYY-MM-DD'
  date date not null unique,
  -- Dine-in
  dine_in_revenue_satang integer not null default 0,
  dine_in_covers integer not null default 0,
  dine_in_service_charge_satang integer not null default 0,
  dine_in_vat_satang integer not null default 0,
  -- GrabFood
  grabfood_gross_satang integer not null default 0,   -- before GP deduction
  grabfood_gp_fee_satang integer not null default 0,  -- 30% of gross
  grabfood_net_satang integer not null default 0,     -- gross - gp fee
  grabfood_orders integer not null default 0,
  grabfood_vat_satang integer not null default 0,
  -- Takeaway
  takeaway_revenue_satang integer not null default 0,
  takeaway_orders integer not null default 0,
  takeaway_vat_satang integer not null default 0,
  -- Voids & Refunds
  void_count integer not null default 0,
  void_total_satang integer not null default 0,
  refund_count integer not null default 0,
  refund_total_satang integer not null default 0,
  -- Totals
  total_gross_satang integer not null default 0,
  total_net_satang integer not null default 0,
  total_vat_satang integer not null default 0,
  -- Meta
  source text not null default 'manual' check (source in ('manual','csv_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- ─── Void & Refunds ──────────────────────────────────────────────────────────
create table if not exists void_refunds (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_id uuid references shifts(id),
  type text not null check (type in ('void','refund')),
  amount_satang integer not null check (amount_satang > 0),
  reason text not null check (reason in ('ลูกค้ายกเลิก','สั่งผิด','คุณภาพไม่ผ่าน','อื่นๆ')),
  reason_note text,
  pos_order_id text,
  approved_by uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists void_refunds_date_idx on void_refunds(date desc);

-- ─── Monthly Targets ─────────────────────────────────────────────────────────
create table if not exists monthly_targets (
  id text primary key,                                -- 'YYYY-MM'
  month text not null,
  revenue_target_satang integer not null default 0,
  food_cost_target_bps integer not null default 3200, -- 3200 = 32.00%
  labor_cost_target_bps integer not null default 2800,
  net_profit_target_bps integer not null default 1200,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ─── OCR Jobs ────────────────────────────────────────────────────────────────
create table if not exists ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  image_hash text,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  ocr_data jsonb,
  error_message text,
  retry_count integer not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ─── Disable RLS (same pattern as other KINTSU projects) ─────────────────────
alter table users disable row level security;
alter table settings disable row level security;
alter table shifts disable row level security;
alter table suppliers disable row level security;
alter table expenses disable row level security;
alter table petty_cash disable row level security;
alter table petty_cash_transactions disable row level security;
alter table daily_sales disable row level security;
alter table void_refunds disable row level security;
alter table monthly_targets disable row level security;
alter table ocr_jobs disable row level security;
