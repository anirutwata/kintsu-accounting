-- Line items for an expense — lets one bill span multiple categories (e.g. a Makro
-- trip with both food and cleaning supplies), each accounted for separately in P&L
-- and synced to FlowAccount as its own line. category is a plain text name (not a
-- foreign key) to match expenses.category's existing convention — matched against
-- expense_categories.name at read time, same as the parent expense already is.
create table if not exists expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  category text not null,
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit text,
  price_per_unit_satang integer not null check (price_per_unit_satang >= 0),
  total_satang integer not null check (total_satang >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists expense_items_expense_id_idx on expense_items(expense_id);
