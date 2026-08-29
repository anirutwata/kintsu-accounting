-- Kiu Sola-only general journal module. Does not modify petty cash or existing journals.
create table if not exists public.kusola_flowaccount_accounts (
  id uuid primary key default gen_random_uuid(),
  flowaccount_id bigint not null,
  code text not null,
  name_local text not null,
  name_foreign text,
  category text,
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  unique (flowaccount_id),
  unique (code)
);

create table if not exists public.kusola_general_journals (
  id uuid primary key default gen_random_uuid(),
  company_key text not null default 'kusola' check (company_key = 'kusola'),
  document_date date not null,
  description text not null,
  reference text not null default '',
  remarks text not null default '',
  note text not null default '',
  contact_name text not null default 'KINTSU Accounting',
  status text not null default 'draft' check (status in ('draft','syncing','synced','voided','error')),
  flowaccount_record_id bigint,
  flowaccount_document_serial text,
  flowaccount_synced_at timestamptz,
  sync_error text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kusola_general_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.kusola_general_journals(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  debit_credit text not null check (debit_credit in ('debit','credit')),
  flowaccount_account_id bigint not null,
  account_code text not null,
  account_name text not null,
  amount_satang bigint not null check (amount_satang > 0),
  description text not null default '',
  unique (journal_id, line_no)
);

create index if not exists kusola_gj_date_idx on public.kusola_general_journals(document_date desc);
create index if not exists kusola_gj_lines_journal_idx on public.kusola_general_journal_lines(journal_id, line_no);

alter table public.kusola_flowaccount_accounts enable row level security;
alter table public.kusola_general_journals enable row level security;
alter table public.kusola_general_journal_lines enable row level security;

drop policy if exists kusola_accounts_read_authenticated on public.kusola_flowaccount_accounts;
create policy kusola_accounts_read_authenticated on public.kusola_flowaccount_accounts for select to authenticated using (true);
drop policy if exists kusola_journals_authenticated on public.kusola_general_journals;
create policy kusola_journals_authenticated on public.kusola_general_journals for all to authenticated using (company_key = 'kusola') with check (company_key = 'kusola');
drop policy if exists kusola_lines_authenticated on public.kusola_general_journal_lines;
create policy kusola_lines_authenticated on public.kusola_general_journal_lines for all to authenticated using (exists (select 1 from public.kusola_general_journals j where j.id = journal_id and j.company_key = 'kusola')) with check (exists (select 1 from public.kusola_general_journals j where j.id = journal_id and j.company_key = 'kusola'));
