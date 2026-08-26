-- The LINE Pay EDC import (042) posts straight to FlowAccount but never surfaces the
-- report's gross amount back onto daily_sales, unlike TTB PromptPay (038) — staff had
-- no way to see or cross-check the EDC total on the sales page the way they can for
-- PromptPay. Mirror the same daily_sales columns TTB uses.
alter table daily_sales
  add column if not exists linepay_edc_gross_satang integer not null default 0,
  add column if not exists linepay_edc_report_id uuid;

alter table daily_sales
  add constraint daily_sales_linepay_edc_report_fk
  foreign key (linepay_edc_report_id) references linepay_edc_reports(id);
