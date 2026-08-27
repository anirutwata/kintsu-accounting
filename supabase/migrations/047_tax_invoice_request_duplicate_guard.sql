-- Prevent a receipt from being submitted twice. Different amounts on the same
-- date remain valid. Tax ID is the authoritative company identity; normalized
-- contact name is used only for requests that do not have a tax ID.
create or replace function tax_invoice_request_company_key(p_tax_id text, p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g') <> ''
      then 'tax:' || regexp_replace(p_tax_id, '[^0-9]', '', 'g')
    else 'name:' || lower(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'))
  end
$$;

create unique index if not exists tax_invoice_requests_active_company_date_amount_uidx
  on tax_invoice_requests (
    document_date,
    tax_invoice_request_company_key(contact_tax_id, contact_name),
    total_satang
  )
  where not is_deleted and status not in ('rejected', 'failed');

revoke all on function tax_invoice_request_company_key(text,text) from public;
grant execute on function tax_invoice_request_company_key(text,text) to anon, authenticated, service_role;
