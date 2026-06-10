-- Grant UPDATE permission on settings table to anon and authenticated roles
-- This allows the API (using anon key) to update settings including UUID columns
GRANT SELECT, INSERT, UPDATE ON settings TO anon;
GRANT SELECT, INSERT, UPDATE ON settings TO authenticated;
