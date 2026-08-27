-- A juristic request without a tax ID could otherwise bypass the authoritative
-- company key by falling back to a slightly different display name.
alter table tax_invoice_requests
  drop constraint if exists tax_invoice_requests_juristic_tax_id_required;
alter table tax_invoice_requests
  add constraint tax_invoice_requests_juristic_tax_id_required check (
    is_deleted
    or status in ('rejected', 'failed')
    or contact_group is distinct from 'juristic'
    or length(regexp_replace(coalesce(contact_tax_id, ''), '[^0-9]', '', 'g')) = 13
  );
