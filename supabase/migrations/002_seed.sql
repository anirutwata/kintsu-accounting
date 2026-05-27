-- Migration 002: Seed Data
-- Default settings + admin user (PIN: 1234)

-- Default settings
insert into settings (id, restaurant_name, vat_rate_bps, service_charge_bps, grabfood_gp_bps)
values (1, 'Kintsu Yakiniku', 700, 1000, 3000)
on conflict (id) do nothing;

-- Default users
-- Owner PIN: 0000 | Manager PIN: 1111 | Cashier PIN: 2222
-- IMPORTANT: Change these PINs after first login via Settings
-- Hashes generated with bcryptjs rounds=10
insert into users (name, pin_hash, role) values
  ('เจ้าของร้าน', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHi', 'owner'),   -- 0000
  ('ผู้จัดการ',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC__jAx1L6tpEBaANT.i', 'manager'), -- 1111
  ('แคชเชียร์',  '$2a$10$mXXc3.R7u0ZUHdl.pWFCW.fHT2A5u7VX89L/H9e1FYH5KjZQI7Wai', 'cashier')  -- 2222
on conflict do nothing;

-- Default suppliers
insert into suppliers (name, category, credit_term_days) values
  ('ซัพพลายเออร์เนื้อ ABC', 'เนื้อ', 7),
  ('ตลาดสด ขอนแก่น', 'ผัก', 0),
  ('บริษัทเครื่องปรุงไทย', 'ซอส/เครื่องปรุง', 15)
on conflict do nothing;
