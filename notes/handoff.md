# Handoff — KINTSU Accounting (2026-08-28)

> ฉบับนี้อัปเดตล่าสุดวันที่ 2026-08-28 หลัง deploy ระบบใบกำกับภาษีเงินสด/TTB แบบออกได้ภายในวันเดียวกัน

## SESSION RESTART SNAPSHOT — CURRENT — อ่านส่วนนี้ก่อน
- Repo: `/Users/anirut/Documents/kintsu-accounting`; live: https://kintsu-accounting.vercel.app; branch `main`.
- `main = origin/main = 2022eb9`. Commit `c06bfa8` ป้องกันคำขอซ้ำ; commit `2022eb9` เปิด same-day cash/TTB พร้อม pending reconciliation และ concurrency guards. Vercel Production deployment `dpl_Ge7RqDsAb3hdF8RUtNcqPwEW5cT7` เป็น Ready และ live alias ชี้ deployment นี้. Deploy จาก GitHub auto-deploy เท่านั้น.
- Supabase Production apply migrations ถึง `051_pending_revenue_sync_race_guards.sql` แล้ว. RPC accounting mutations ของ tax-invoice reconciliation จำกัด service role.
- ระบบใบกำกับภาษีเต็มรูปแบบป้องกันรายได้ซ้ำด้วย authoritative match `วันที่ใบเสร็จ + ยอดรวม + ช่องทางชำระ`; รูปใบเสร็จบังคับแนบและผู้ดูแลตรวจ/อนุมัติผ่าน Telegram ก่อน mutation.
- เงินสด/TTB ถ้า JV รายวันลงแล้ว: ออก paid tax invoice แล้วสร้าง reversal JV Dr 41210 / Cr 11112 หรือ 11122.07 เท่ายอดเต็มใบเสร็จ. ถ้ายังไม่ลง JV: เก็บ allocation แล้วให้ JV ในอนาคตลงเฉพาะยอดสุทธิหลังหักใบกำกับภาษีเต็มรูป.
- EDC ภายในเดือนปัจจุบัน: Cash Sale รายวันต้องเหลือ gross authoritative ลบยอดใบกำกับภาษีเต็มรูป; ถ้ามี Cash Sale แล้วระบบ Void/verify และสร้างใบสุทธิใหม่. Settlement JV ยังคงใช้ gross/fee/VAT/net จาก CSV เต็มจำนวน ไม่เปลี่ยน.
- EDC ต่างเดือนหรือพบเอกสาร/สถานะกำกวม: `manual_review` เท่านั้น ห้ามแก้ VAT document อัตโนมัติ. ใช้เดือนปฏิทินเป็น conservative cutoff ตามที่ผู้ใช้ยืนยัน.
- RPC mutation `reserve_tax_invoice_revenue` และ `record_tax_invoice_created` จำกัด `service_role`; Telegram webhook ใช้ server-side admin client. Allocation ถูก activate พร้อมการบันทึก invoice และ lock source rows เพื่อป้องกัน race กับ cash/TTB/EDC sync.
- Retry ใช้ FlowAccount IDs ที่บันทึกแล้ว ไม่สร้าง INV/JV/Cash Sale ซ้ำ; ถ้าบันทึก DB หลังสร้างเอกสารล้มเหลวจะ Void ชดเชย. ส่งอีเมลหลัง accounting complete เท่านั้น. คำขอที่เริ่มจองยอด/สร้างเอกสารแล้วห้าม reject อัตโนมัติและจะส่ง `accounting_review`.
- Historical issued tax invoices เดือนสิงหาคม reconcile แล้วเมื่อ 2026-08-27: 10 requests ที่ FlowAccount INV ถูก Void/ลบอยู่ก่อนแล้วถูก soft-delete พร้อม audit note; 3 paid transfer INV วันที่ 22–23 ส.ค. คง `manual_review` เพราะไม่มี authoritative TTB report/source JV ให้ย้อน; 3 paid EDC INV วันที่ 21/23 ส.ค. เป็น `complete` หลังปรับ Cash Sale ตามยอดสุทธิ. `INV2026080034` ตรวจพบว่า FlowAccount INV ถูกลบอยู่ก่อนแล้ว จึง soft-delete request พร้อม audit และไม่ได้สร้าง reversal/correction.
- Production verification: RPC execute = anon false / authenticated false / service_role true; active Codex tax-dedup test rows = 0, cleaned soft-deleted rows = 7. Live test รอบสุดท้ายหลัง revoke หยุดก่อนสร้าง FlowAccount เพราะ `.env.local` มี service-role placeholder; ไม่มีเอกสารทดสอบใหม่ค้าง. Live test ก่อนหน้าเคยสร้าง/retry/Void INV+JV สำเร็จและ cleanup แล้ว.
- Verification ล่าสุด commit `2022eb9`: Vitest 81 passed / 3 skipped, `tsc --noEmit`, targeted ESLint และ Next Production build ผ่าน. Spec/Standards re-review ยืนยันว่า duplicate-accounting concurrency race ถูกปิดแล้ว.
- Working tree ของผู้ใช้ที่ห้ามแตะ/stage/commit: modified `.gitignore`; untracked `.claude/`, `notes/flowaccount-journal-attachment-research-2026-08-25.md`, `supabase/.temp/`, `รหัส-fixed.gs`. ไฟล์ `รหัส-fixed.gs` มี secret ฝังอยู่ ห้าม `git add` และห้ามเปิดเผยเนื้อหา.
- FlowAccount และ Supabase เป็น Production จริง. ก่อน mutation ต้องตรวจ DB/FlowAccount จริง; test documents ต้อง Void/cleanup/verify; soft-delete only; ห้าม replay `EDC_DailyReport_20260825.csv`; ห้ามสร้าง Cash Sale/JV เดิมซ้ำ.
- งานที่ยังพักและห้ามหยิบมาทำเอง: monthly LINE Pay fee tax invoice, reconciliation ใบโอนย้อนหลัง 3 ใบที่ยัง `manual_review`, Grab automation, WHT automation.
- Workflow ทุกงาน: ตรวจ git/Production ก่อน → confirm scope → implement/test/build/review → commit ด้วย `git commit -F <tmpfile>` → ขออนุญาตก่อน push เสมอ. ห้าม manual `vercel deploy`.

## TAX INVOICE REVENUE DEDUP — `4f7a9cb` (deployed 2026-08-27)
- Decision/spec ฉบับเต็ม: `/Users/anirut/brainstorms/2026-08-27-tax-invoice-revenue-dedup.md`; implementation หลักอยู่ใน `lib/taxInvoiceApprovalService.ts`, `lib/taxInvoiceApprovalWorkflow.ts`, `lib/taxInvoiceDedupPolicy.ts`, `lib/netRevenueAmount.ts`, cash/TTB/EDC sync modules และ migration 045.
- กติกาธุรกิจที่ผู้ใช้ยืนยัน: ใบกำกับภาษีหนึ่งใบต้องเต็มยอดใบเสร็จ, หนึ่ง payment ต่อหนึ่งใบ, ขอภายหลังได้แต่ `document_date` ต้องตรงวันที่ใบเสร็จ, ผู้ดูแลตรวจรูปผ่าน Telegram. Receipt-level uniqueness ยังเป็น human control; ระบบจำกัดยอดรวมต่อ date/channel ไม่ให้เกิน authoritative pool และ idempotent ต่อ request.
- เงินสดและ TTB รายวันปกติเป็น JV ไม่มี VAT; เมื่อออกใบกำกับภาษีเต็มรูป บริษัทรับรู้ invoice พร้อม VAT แล้วระบบหักรายได้ซ้ำด้วย reversal JV หรือ net future JV ตามสถานะ source.
- EDC รายวันเป็นเอกสารภาษีอย่างย่อ/Cash Sale มี VAT; invoice เต็มรูปต้องถูกหักออกจาก Cash Sale รายวัน ไม่ใช้ correcting JV อย่างเดียว เพราะ VAT report จะยังซ้ำ.
- `linepay_edc_revenue_days.full_tax_invoice_satang`, `daily_sales.full_tax_invoice_cash_satang`, `ttb_promptpay_reports.full_tax_invoice_satang` เก็บ allocation สำหรับเอกสารรายวันในอนาคต. Zero-net cash/TTB/EDC ต้อง skip การสร้างเอกสารใหม่อย่างปลอดภัย.
- ห้ามเพิ่ม cancellation/release allocation แบบเงียบ ๆ. ถ้าจะยกเลิก request ที่เริ่ม accounting แล้ว ต้องออกแบบ audited release/void workflow และตรวจ FlowAccount ก่อนทุกครั้ง.

## TAX INVOICE MOBILE UPDATE + PENDING EDC — `edb339b`–`a9b13ac` (deployed 2026-08-27)
- `edb339b`: ใบกำกับภาษี `credit_card` ของวันขายปัจจุบันหรือย้อนหลังไม่เกิน 1 วันออกได้ก่อน LINE Pay CSV มาถึง โดยใช้ `dedup_action = pending_edc_report`; หลังสร้าง INV จะคง `dedup_state = invoice_created` จน reconcile.
- Migration 046 เพิ่ม service-role-only RPC `reconcile_pending_edc_tax_invoices(date)`. Importer เรียก RPC หลัง import CSV และก่อน sync Cash Sale เพื่อ allocate ใบเต็มรูปเข้า `full_tax_invoice_satang`; Cash Sale จึงสร้างจาก gross ลบ allocation ตั้งแต่แรก.
- ถ้ายอด EDC authoritative ไม่พอรองรับ INV ที่ออกไปแล้ว ระบบใช้ `manual_review_edc_pool_exceeded`, ไม่ทำ allocation ติดลบ และส่ง Telegram แจ้งผู้ทำบัญชี.
- `4350418`: Telegram status update แสดงรายละเอียดลูกค้าเต็มเหมือนข้อความคำขอเดิม และเพิ่มหน้า `/tax-invoice-requests` พร้อม API สำหรับดูประวัติคำขอ.
- `23aa6fb`: ฟอร์มเลือกสำนักงานใหญ่/สาขาแทน free text; `a9b13ac`: เลขสาขาเติมศูนย์ซ้ายให้ครบ 5 หลัก.
- Production verification หลัง sync local: `main = origin/main = a9b13ac`, Vercel Ready, migration 046/RPC มีจริงและ permission ถูกต้อง, active `pending_edc_report` = 0 และ active `historical_review` = 0.

## AUGUST HISTORICAL TAX-INVOICE RECONCILIATION (Production, 2026-08-27)
- ผู้ใช้ยืนยัน `INV2026080025` ฿1,498 และ `INV2026080028` ฿1,634 เป็นเงินโอน ไม่ใช่ EDC; ห้ามนำสองใบนี้ไปลด Cash Sale EDC วันที่ 23 ส.ค.
- EDC 21 ส.ค.: `INV2026080023` collected ฿2,432; Void `CA2026080022` gross ฿20,400 และสร้าง `CA2026080026` paid ฿17,968. DB allocation ฿2,432 และ request `complete`.
- EDC 23 ส.ค.: `INV2026080026` collected ฿1,470 และ `INV2026080027` collected ฿3,004; Void `CA2026080024` gross ฿24,271, สร้าง/แล้ว Void intermediate `CA2026080027` ฿22,801, final `CA2026080028` paid ฿19,797. DB allocation รวม ฿4,474 และ requests ทั้งสอง `complete`.
- ตรวจ FlowAccount terminal state แล้ว: source/intermediate Cash Sales เป็น Void; final Cash Sales paid/date/collected ถูกต้อง. Settlement JVs วันที่ settlement 22 และ 24 ส.ค. ยังคง `synced` ด้วย gross/fee/VAT/net เดิม ไม่ถูกแก้.
- Paid transfer INV ที่ยังไม่มี source JV ยืนยันได้คง `manual_review` 3 ใบ: `INV2026080024` วันที่ 22 ส.ค. ฿3,389 และ `INV2026080025` ฿1,498 + `INV2026080028` ฿1,634 วันที่ 23 ส.ค. ห้ามสร้าง reversal จนกว่าจะพบ/ยืนยัน source revenue posting จริง.

## DUPLICATE TAX-INVOICE REQUEST GUARD (Production DB applied 2026-08-28)
- พบคำขอซ้ำวันที่ 27 ส.ค. บริษัท/เลขผู้เสียภาษีเดียวกัน ยอดรับจริง ฿1,585 และช่องทาง EDC: `INV2026080029` กับ `INV2026080030` เป็นคนละ request/FlowAccount record จริง ไม่ใช่ UI แสดงซ้ำ.
- ผู้ใช้ยืนยันให้คง `INV2026080029` ซึ่ง approve/ส่งอีเมลแล้ว และลบยอด `INV2026080030`. ตรวจ exact record/status/collected ก่อน Void; FlowAccount `INV2026080030` terminal state = `void`. Request ถูกตั้ง `cancelled`, soft-delete และมี audit note; `INV2026080029` ยัง active/emailed.
- Migration 047 เพิ่ม unique index ป้องกัน active request ซ้ำด้วย `document_date + company identity + total_satang`. Company identity ใช้เลขผู้เสียภาษี normalize เป็นหลัก; ถ้าไม่มีจึง fallback ไปชื่อ normalize. Migration 048 บังคับเลขผู้เสียภาษี 13 หลักสำหรับคำขอนิติบุคคล active เพื่อปิดช่อง mixed identity; API บังคับเหมือนกันและ preflight ยัง fallback เทียบชื่อ normalize สำหรับข้อมูลเก่าที่เลขหาย. Status `rejected`/`failed` และ soft-deleted rows ไม่ขวางการส่งใหม่.
- API ตรวจล่วงหน้าและคืน HTTP 409 พร้อมข้อความภาษาไทย; unique index เป็น concurrency backstop. บริษัท/วันเดียวกันแต่ยอดต่างกันยังอนุญาตตามคำสั่งผู้ใช้.
- Production transaction test ผ่าน: duplicate key ถูก reject, different amount ถูก accept, rollback แล้ว active test rows = 0.

## SAME-DAY CASH + TTB TAX INVOICES — `2022eb9` (deployed 2026-08-28)
- ลูกค้าชำระเงินสดหรือเงินโอน TTB สามารถ approve/รับ INV ทางอีเมลในวันขายได้ แม้ daily sales หรือรายงาน TTB ยังไม่เข้า เช่นเดียวกับ EDC.
- เงินสดใช้ `pending_cash_sales`; เมื่อบันทึก daily sales ระบบเรียก service-role RPC reconcile ก่อนสร้าง cash JV แล้ว allocate เข้า `daily_sales.full_tax_invoice_cash_satang`. JV จึงลงเฉพาะยอดสุทธิ.
- เงินโอนใช้ `pending_ttb_report`; เมื่อ importer บันทึกรายงาน TTB ระบบ reconcile ก่อน `syncTtbReportToFlowAccount` แล้ว allocate เข้า `ttb_promptpay_reports.full_tax_invoice_satang`. JV จึงลงเฉพาะยอดสุทธิ.
- ถ้ายอด authoritative ภายหลังไม่พอ request จะเป็น `manual_review_revenue_pool_exceeded` และห้ามสร้าง JV รายวันต่อ; TTB cron ส่ง failure alert ตาม workflow เดิม ส่วน cash save คืน partial error ให้ผู้ดูแล.
- Migration 049 เพิ่ม `reserve_tax_invoice_revenue_v2`, `reconcile_pending_cash_tax_invoices` และ `reconcile_pending_ttb_tax_invoices`; ทั้งหมด service-role-only. Sales automatic/manual sync และ TTB automatic/manual sync ถูกบังคับให้ reconcile ก่อน accounting mutation.
- Migration 050 เพิ่ม guarded v3/v2 RPCs: pending ใช้ได้เฉพาะเมื่อ source row/report ยังไม่มีจริง (source ที่มี authoritative = 0 ต้อง reject), และ manual-review pool ที่ยอดไม่พอยังคง block JV ในทุก retry.
- Migration 051 ปิด race สองทิศทาง: pending request ที่ยัง `reserved` จะ block daily JV จนบันทึก INV/reconcile เสร็จ และ cash/TTB sync claim ภายใต้ advisory lock เดียวกับ tax-invoice allocation พร้อมคืน source snapshot หลัง lock เพื่อคำนวณยอดสุทธิใหม่ ห้ามใช้ยอดที่อ่านก่อน claim.
- Production transaction regression tests ผ่าน: reserved pending request block cash JV, cash claim และ TTB claim คืน allocation ล่าสุดหลัง lock; ทุก test rollback และไม่มี test rows/FlowAccount documents.
- Production transaction integration test ผ่านทั้ง cash/TTB pending → complete และ rollback แล้ว; ไม่สร้าง FlowAccount documents/ไม่เหลือ test rows. Permission check anon/authenticated false, service role true.
- GitHub `main` และ `origin/main` เท่ากับ `2022eb9`; Vercel Production `dpl_Ge7RqDsAb3hdF8RUtNcqPwEW5cT7` Ready และ alias `https://kintsu-accounting.vercel.app` ชี้ release นี้แล้ว.

## SESSION RESTART SNAPSHOT — ARCHIVED ก่อน `4f7a9cb`
- Repo: `/Users/anirut/Documents/kintsu-accounting`; live: https://kintsu-accounting.vercel.app; branch `main`.
- local `main` = `origin/main` = `33a44b0`; Vercel Production deployment `dpl_4cSG44gfn9jr5QbCsVpLkXtGFCLg` Ready และ live alias ชี้ deployment นี้.
- Commits ล่าสุดที่ deploy แล้วต่อจากงาน EDC เดิม: `0f87a2c` date selectors ภาษาไทยสำหรับรายจ่าย → `399bb59` multi-day LINE Pay EDC + historical backfill support → `33a44b0` cash revenue auto-sync เมื่อบันทึกรายรับ.
- TTB cron: `0 20 * * *` UTC = 03:00 Asia/Bangkok. อ่าน Gmail exact sender/subject, decrypt XLSX, ตรวจชื่อไฟล์ + summary/cut-off date + Payment Date ทุก Success ให้ตรงกัน, ตรวจ D-1 ก่อน mutation, แล้วสร้าง Approved JV Dr 11122.07 / Cr 41210.
- หาก cron TTB ล้มเหลว จะ alert Telegram topic `sales`; manual sync ไม่ alert ซ้ำ. หากข้อความเตือนว่าอาจมี JV รอ Void ต้องตรวจ FlowAccount ก่อน retry.
- รายรับเงินสดสร้าง Approved JV Dr 11112 / Cr 41210. Credit-line description เป็น `รายรับเงินสด วันที่ YYYY-MM-DD`; TTB เป็น `รายรับพร้อมเพย์ TTB Smart Shop วันที่ YYYY-MM-DD`. ตั้งแต่ `33a44b0` การบันทึกรายรับจะ sync เงินสดใน action เดียวกันอัตโนมัติ; ปุ่ม manual ยังใช้ retry แบบ idempotent ได้.
- Production 2026-08-24: TTB active `JV2026080049` ฿19,708 และ cash active `JV2026080050` ฿7,584. ใบเดิม `JV2026080045/0046` Void แล้ว — ห้ามสร้างซ้ำ.
- Historical tax-invoice revenue reclassification: `JV2026070045` ฿2,064 และ `JV2026080048` ฿13,574, Dr 41110 / Cr 41210; บันทึกใน `manual_journal_entries` แล้ว — ห้ามสร้างซ้ำ.
- LINE Pay EDC cron `0 5 * * *` UTC = 12:00 Asia/Bangkok. อ่าน Gmail sender `noreply-merchant@linepayth.com`, CSV เป็น authoritative; ยอดบัตรที่พนักงานกรอกใช้ reconciliation เท่านั้น ห้ามส่งเข้า FlowAccount.
- EDC Step 1 วันขายจาก `transaction_time`: Cash Sale รับชำระเข้า `11379.01`, รายได้ `41210`, VAT 7%. Step 2 วัน `settlement_date`: Approved JV Dr `11121.01` KBank net + Dr `53212` fee + Dr `17115` VAT รอใบกำกับ / Cr `11379.01` gross.
- LINE Pay ออกใบกำกับภาษีค่าธรรมเนียมรวมต้นเดือนถัดไป; automation ย้าย `17115` เป็นภาษีซื้อยังไม่ทำ. เรื่อง dedupe ใบกำกับภาษีลูกค้ากับยอดรายวันพักไว้ ต้องออกแบบรวมทั้งเงินสด/พร้อมเพย์/EDC ภายหลัง.
- Migration `042_linepay_edc_email_import.sql`, `043_linepay_edc_daily_sales_column.sql` และ `044_linepay_edc_multi_revenue_days.sql` apply บน Supabase Production แล้ว. Production ยืนยัน column `linepay_edc_gross_satang` / `linepay_edc_report_id` และตาราง aggregate revenue-day มีจริง.
- Future customer tax invoices force sell account `41210`; customer-tax-invoice dedupe ยังพักไว้. Grab และ WHT automation ยังห้ามหยิบมาทำเอง.
- Verification ของ EDC desktop commit `4db3474`: 38 tests passed, 2 live tests skipped, TypeScript passed, Production build passed, Spec/Standards review passed. Mobile commits #22–#26 deploy Production Ready แล้ว.
- Working tree มีของผู้ใช้ค้างตามปกติ: modified `.gitignore`; untracked `.claude/`, `notes/`, `รหัส-fixed.gs`. ห้าม stage/commit และห้ามเปิดเผย secret ใน `รหัส-fixed.gs`.
- Workflow ทุกงาน: verify git/DB/FlowAccount จริง → confirm scope → implement/test → commit ด้วย `git commit -F <tmpfile>` → ขอผู้ใช้ยืนยันก่อน push. FlowAccount เป็น Production จริง; test document ต้อง Void/cleanup และ verify ทุกครั้ง.

## SESSION UPDATE — EDC + CASH BACKFILLS (2026-08-27)

### LINE Pay EDC multi-day/importer + historical posting (`399bb59`, deployed)
- Importer รองรับรายงานหนึ่งไฟล์ที่มีหลายวันขาย และ aggregate เป็น Cash Sale หนึ่งใบต่อ `transaction_time` calendar date; settlement ยังคงเป็น Approved JV หนึ่งใบต่อรายงาน/`settlement_date`.
- รองรับ `CREDIT_CARD_LOCAL`, `CREDIT_CARD_INTER`, `JCB_CARD`, `DEBIT_CARD`, `QR_PROMPTPAY`, `UPI_CARD`; `QR_PROMPTPAY` ในรายงาน LINE Pay ถือเป็นยอด EDC authoritative ตามคำสั่งผู้ใช้.
- ยอมรับชื่อร้านเดิม exact `คิตสุ ยากินิคุ` เมื่อ merchant ID ตรง; terminal ID ไม่ใช้ validate ร้าน.
- Migration 044 เพิ่ม global revenue-day aggregate, report contribution table และ atomic RPC; RPC จำกัด `service_role`. ตั้ง `SUPABASE_SERVICE_ROLE_KEY` แบบ encrypted ใน Vercel Production แล้ว ห้ามคัดลอก secret ลง repo.
- Historical backfill ใช้เฉพาะ 20 ไฟล์ settlement 2–24 ส.ค. ครอบคลุมวันขาย 1–23 ส.ค. 2569; **ไม่ได้ replay `EDC_DailyReport_20260825.csv`**.
- Production final: 23 Cash Sales + 20 settlement JVs, 304 transactions, gross รวม ฿391,319; Cash Sales/settlements synced ครบ ไม่มี error/cleanup. Breakdown: QR PromptPay 2 รายการ ฿555, Debit Card 3 รายการ ฿4,058, UPI 1 รายการ ฿696.
- VAT edge case วันขาย 13 ส.ค. gross ฿10,629 ใช้ฐาน+VAT ฿10,629.01 และ receipt rounding down ฿0.01; FlowAccount `CA2026080014` ยอดชำระ authoritative ฿10,629 ตรง.
- Verification: Cash Sale จริง 23 ใบ active/date/serial/collected ตรง DB รวม ฿391,319; tests 49 ผ่าน (2 live skip), build/TypeScript ผ่าน, review ผ่าน.

### Cash revenue full backfill + automatic sync (`33a44b0`, deployed)
- Root cause วันที่ 25–26 ส.ค. ไม่ลง: เดิม save รายรับกับปุ่ม `ส่งเงินสดเข้า FlowAccount` เป็นคนละ action และไม่มี cash cron; การอนุมัติเชื่อมระบบจึงไม่ได้ auto-sync.
- ผู้ใช้ยืนยันให้ลงเงินสดทั้งหมดแม้รับทราบความเสี่ยงรายได้ซ้ำกับ customer tax invoices (dedupe design เดิมยังพักไว้).
- Backfill Production ครบ 99 วัน ช่วง 20 พ.ค.–26 ส.ค. 2569 รวม ฿913,091: สร้างใหม่ 98 Approved JVs และ reuse วันที่ 24 ส.ค. `JV2026080050` (`created:false`).
- วันที่ 25 ส.ค. = `JV2026080097` ฿9,277; วันที่ 26 ส.ค. = `JV2026080098` ฿1,531.
- Final DB reconcile: `synced` 99/99, record IDs/serials distinct ครบ, synced amount ตรงยอดเงินสดทุกวัน, ไม่มี error/cleanup.
- ตั้งแต่ `33a44b0`, `POST /api/sales` บันทึกยอดแล้วเรียก existing idempotent cash state machine ทันที. ถ้า FlowAccount ล้มเหลว KINTSU ยังเก็บยอดและคืน HTTP 207 + `partialErrors.cash`; UI แจ้งว่า save สำเร็จแต่บัญชีล้มเหลวและ retry ได้.
- Verification: full tests 49 ผ่าน (2 live skip), production build/TypeScript ผ่าน, targeted lint ผ่านโดยเหลือ warning เดิมของ React hook 1 จุด, Standards/Spec review ไม่มี blocker.

## สถานะปัจจุบัน (บันทึกเดิมก่อน snapshot ด้านบน — ใช้ snapshot เป็นหลัก)
- สถานะอ้างอิงเดิมเคยอยู่ที่ `def7d5c`; สถานะล่าสุดให้ใช้ `SESSION RESTART SNAPSHOT` ด้านบน
- Vercel deployment `dpl_6J27g2v3tE22sJcwJZ5YnjhvAaMx` = Ready และ alias อยู่ที่ https://kintsu-accounting.vercel.app
- FlowAccount PAY sync, บันทึกยอดโอน/สลิป, เลข EXP บนการ์ด และปุ่มแนบสลิปแบบ mobile-friendly deploy แล้ว
- ชุดทดสอบล่าสุด: Vitest 13 tests ผ่าน + 2 live integration skip ตาม flag, `tsc --noEmit`, targeted ESLint และ production build ผ่าน

## LINE Pay EDC automation (2026-08-26, commits `4db3474` + mobile PR #23–#26, deployed)
- Gmail account ใช้ env เดียวกับ TTB (`KINTSU_EMAIL_ADDRESS`), sender exact `noreply-merchant@linepayth.com`, subject prefix `รายงานสรุปยอดขาย EDC -`, ต้องมี CSV เดียวต่ออีเมล.
- Vercel cron `/api/cron/linepay-edc` รัน `0 5 * * *` UTC = 12:00 Asia/Bangkok; manual `/api/linepay-edc/sync` จากหน้ารายรับไม่ส่ง Telegram ซ้ำ. Cron failure alert topic `sales` และเตือนให้ตรวจ FlowAccount ก่อน retry.
- Validation fail-closed: exact CSV headers/filename date, merchant ID/name, service group/name, transaction IDs unique, one transaction date, Settlement = D+1, and per-row/total `amount = fee + VAT + net`.
- `terminal_id` ใน CSV ห้ามใช้ยืนยันร้าน: LINE Pay เปลี่ยนค่าตาม card scheme; `JCB_CARD` รองรับแล้ว. ตรวจ merchant ID/name แทน. FlowAccount EDC clearing ยัง exact `11379.01 ... 88122653`.
- Cash Sale วัน `transaction_time`: contact `Cash Sale / ขายเงินสด`, revenue `41210`, VAT 7%, paid via configured EDC channel ID `87478` เข้า clearing `11379.01`.
- Settlement JV วัน filename/`settlement_date`: Dr `11121.01` KBank 1608755558 ยอด net; Dr `53212` fee ก่อน VAT; Dr `17115` VAT รอใบกำกับ LINE Pay; Cr `11379.01` gross.
- State machines แยก Cash Sale/Settlement: `idle|creating|synced|cleanup_pending|error`; claim atomic, compensate Void เมื่อ DB save fail, re-fetch ยืนยัน Void ก่อน reset/retry.
- Dedupe: Gmail message ID, attachment SHA-256, revenue date, settlement date, transaction ID; soft-delete only. Daily sales เก็บ authoritative `linepay_edc_gross_satang` + report ID และ UI เทียบยอดพนักงานได้.
- ห้ามรันไฟล์ `EDC_DailyReport_20260825.csv` ย้อนหลังเข้า import แบบสร้างเอกสารซ้ำ: มี Cash Sale ระบบเดิมของวันนั้นอยู่. Automation ตั้งใจรับเฉพารอบปัจจุบัน.

## TTB Smart Shop PromptPay + Revenue JV (2026-08-25, รอ commit/push รอบแก้ JV)
- คืนช่องพร้อมเพย์ให้พนักงานกรอกเหมือนเดิมเพื่อ reconciliation; ห้ามทิ้งค่าพนักงาน แต่ยอด authoritative ทางบัญชียังมาจากอีเมลธนาคารและไม่แยก FoodStory/Papaya
- Gmail: account อยู่ใน `KINTSU_EMAIL_ADDRESS`; รับเฉพาะ sender `ttbsmartshop@digio.co.th` และ subject exact; รหัสไฟล์ XLSX อยู่ใน `TTB_SMARTSHOP_REPORT_PASSWORD` (ห้าม commit secret)
- อ่านไฟล์ Excel เข้ารหัส ตรวจเฉพาะ `Success` และเทียบจำนวน/ยอดกับ summary ก่อนบันทึก; dedupe ด้วย message ID, SHA-256, report date และ bank reference
- Manual sync จากหน้ารายรับ และ Vercel Cron `0 20 * * *` = 03:00 น. Asia/Bangkok สำหรับรายงาน D-1
- ตั้งค่าบัญชีรับเงินใน Settings > ระบบ; Production เลือก TTB 760-2-31598-3 แล้ว
- พร้อมเพย์สร้าง Approved JV: Debit exact `11122.07 / TTB 7602315983`, Credit exact `41210`; เงินสดพนักงานสร้าง Approved JV: Debit exact `11112`, Credit exact `41210`
- เงินสด/พร้อมเพย์/โอนบริษัทไม่สร้าง Cash Sale; บัตรเครดิตยังคง Cash Sale เพียงช่องทางเดียว แต่ decision เรื่อง dedupe กับใบกำกับภาษีลูกค้ายังรอคุยต่อ
- Migration 038–041 apply บน Supabase Production แล้ว; secret รหัสไฟล์ตั้งบน Vercel Production แล้ว
- Live 2026-08-24: พร้อมเพย์ 28 รายการ ฿19,708 → `JV2026080045`; เงินสด ฿7,584 → `JV2026080046`; retry ทั้งคู่ `created:false`
- `CA2026080002` (พร้อมเพย์) และ `CA2026080003` (เงินสด) Void/verify แล้ว; `CA2026080004` บัตรเครดิตคงเดิมและ retry `created:false`; `CA2026080001` เป็นเอกสารทดสอบเดิมที่ Void แล้ว
- Grab และ EDC ยังไม่รวมใน feature นี้ ตามคำสั่งผู้ใช้ให้ทำ PromptPay ก่อน

## โอนเงินระหว่างบัญชี → FlowAccount สมุดรายวันทั่วไป (2026-08-25, deploy แล้ว)
- Commits: `625a943`, `b7a3d24`, `f687748`, `f46c60d`; migration `037_bank_transfer_flowaccount_journals.sql` apply บน Supabase Production แล้ว
- เมื่อสร้างรายการโอนใหม่ KINTSU สร้าง Approved Journal Voucher (`documentType=51`) ใน FlowAccount อัตโนมัติ:
  - Debit = บัญชีปลายทาง
  - Credit = บัญชีต้นทาง
  - ยอด Debit/Credit เท่ากับยอดโอนจริง
- เก็บ FlowAccount record ID/เลข `JV...` และแสดงบนการ์ดรายการโอน
- One-time backfill รายการเดิม 62 รายการ (1 มิ.ย.–23 ส.ค. 2569) ทำสำเร็จครบเมื่อ 2026-08-25:
  - 62 JV / 62 record ID / 62 serial ไม่ซ้ำ
  - ยอดรวม ฿2,721,329; state `synced` ทั้งหมด; unsynced = 0
  - ช่วงเลขเอกสาร `JV2026060007` ถึง `JV2026080030`
  - runner ชั่วคราวถูกลบแล้ว ไม่มี cron/backfill job ค้าง; หลังจากนี้เฉพาะรายการใหม่ auto-sync ตามปกติ
- ผูก `bank_accounts.flowaccount_chart_of_account_id` กับผังบัญชีจริงครบ 5 บัญชี; เงินสด resolve เฉพาะรหัส `11112 เงินสดคงเหลือ`
- lifecycle ป้องกันเอกสารซ้ำ: `idle → creating → synced → voiding → void_pending` พร้อม `error`; claim แถวแบบ atomic ก่อนสร้าง JV
- แก้ไข: claim → Void JV เดิม → บันทึกข้อมูลใหม่ → สร้าง JV ใหม่; ลบ: Void ก่อนแล้ว soft-delete เท่านั้น
- ถ้าสร้าง JV สำเร็จแต่บันทึกเลขกลับ KINTSU ไม่ได้ ระบบ Void ชดเชย และ live test เก็บ cleanup record ID ไว้ได้
- FlowAccount Production quirks ที่ยืนยันจริง:
  - `/journal-entries/approve` ต้องมี `contactName: "KINTSU Accounting"` แม้ OpenAPI บอกว่า JV ไม่ต้องมี contact
  - reference ยาวระดับ UUID ทำให้ API คืน opaque 500 จึงใช้ `KINTSU-` + UUID 8 ตัวแรก
- Live-test Production ผ่าน: สร้าง Approved JV ฿1, retry ไม่สร้างซ้ำ, Void สำเร็จ และแถวทดสอบถูก soft-delete; active test rows = 0
- Verification ล่าสุด: full Vitest 13 ผ่าน + 2 live integration skipped ตาม flag, JV live integration ผ่านเมื่อเปิด flag, `tsc --noEmit`, targeted ESLint และ Next production buildผ่าน

## แก้บัญชีเงินสดของ JV เป็น 11112 (2026-08-25, commit `def7d5c`, deploy แล้ว)
- Root cause: FlowAccount ช่องทางรับ/จ่ายเงินสดลง `11112 เงินสดคงเหลือ` แต่ bank-transfer JV ของ KINTSU เคย hard-code `11111 เงินสดในมือ` ทำให้เงินสดรับ/จ่ายและการนำฝากธนาคารเคลื่อนไหวคนละบัญชี
- เปลี่ยน resolver ให้เลือกเฉพาะรหัส `11112`; ถ้าหาไม่พบให้ fail ชัดเจนและห้าม fallback ไป `11111`
- ตั้งใจล็อกบัญชีนี้ในโค้ด ไม่มีช่องให้เปลี่ยนใน Settings เพื่อป้องกันเลือกบัญชีเงินสดผิดอีก
- เพิ่ม regression test `lib/bankTransferCashAccount.test.ts` ครอบคลุมการเลือก 11112 และ missing-account failure
- Live-test Production ฿1 ผ่าน: สร้าง/retry/void สำเร็จ; active Codex test rows = 0
- ซ่อมย้อนหลังเฉพาะรายการ `เงินสด -> บัญชี` ที่ KINTSU สร้างครบ 38 รายการ:
  - Void JV เดิมและสร้างใหม่โดยเครดิต `11112` ครบ 38/38
  - ยอดรวมเดิม ฿651,329; มิ.ย. 10 ใบ ฿379,036, ก.ค. 16 ใบ ฿125,490, ส.ค. 12 ใบ ฿146,803
  - หลังซ่อม state `synced` 38/38, record ID/serial ไม่ซ้ำครบ, ไม่มี `error`/`voiding`/`void_pending` ค้าง
  - ระหว่างรอบแรก FlowAccount rate-limit 429 หลัง 33 ใบ; state machine หยุดปลอดภัย แล้ว resume อีก 5 ใบด้วย delay สำเร็จ
  - runner one-time ถูกลบแล้ว ไม่มี backfill job/cron ค้าง
- Verification: full Vitest 13 ผ่าน + 2 live tests skip ตาม flag, `tsc --noEmit`, targeted ESLint และ production build ผ่าน

## งาน FlowAccount ที่เสร็จและ deploy แล้ว (session 2026-08-24 กลางคืน)

### Auto-pay ครบทุกช่องทาง
- Live-test Production ครบแล้ว: โอนเงิน, เงินสด และบัตรเครดิตผ่าน EDC
- เอกสารทดสอบถูกลบ/void ใน FlowAccount และแถวทดสอบใน KINTSU ถูก soft-delete เรียบร้อยแล้ว
- ห้ามสร้างเอกสารทดสอบ Production ทิ้งไว้; convention เดิมด้านล่างยังใช้เสมอ

### นำเข้าใบเตรียมจ่าย/ใบสำคัญจ่าย (PAY) จาก FlowAccount
- Commits หลัก: `3a21c1b`, `e07c9bb`, `5ec812c`
- OpenAPI ไม่มี PAY endpoint/webhook โดยตรง จึงอ่าน PAY ผ่านเอกสาร EXP ต้นทาง:
  - `pendingPayment` (status 4) = PAY รอชำระ
  - `paidByPaymentSlip` (status 6) = ชำระผ่าน PAY แล้ว
  - ใช้ `referencedToMe`, payment date/channel และเลข PAY สำหรับ grouping
- Backfill เริ่มตั้งแต่ 2026-06-01 (มิ.ย.–ส.ค. 2569 ณ วันที่ทำงาน) และ sync แบบ idempotent
- มีปุ่ม Sync ด้วยมือ และ Vercel Cron `30 23 * * *` = 06:30 น. Asia/Bangkok ทุกวัน
- `CRON_SECRET` ตั้งใน Vercel Production แล้ว (ห้ามบันทึกค่า secret ลง repo)
- หน้า `/payment-slips` แสดงหนึ่งยอดโอนต่อ PAY และ EXP ทุกใบภายในกลุ่ม
- ยอดโอนธนาคารใช้ยอดสุทธิหลังหัก WHT; ยอดก่อน WHT แสดงแยก
- รองรับสถานะรอชำระ/ชำระแล้ว, โอนเงิน, เงินสด, EDC และ petty cash method 11
- Import เป็น read-only ทั้ง UI และ API; ห้ามส่งกลับ/void FlowAccount จาก expense route ทั่วไป
- Deduplicate ด้วย `flowaccount_record_id`; historical exact match ใช้ date + amount + normalized vendor และ error ถ้ากำกวม
- Reconciliation soft-delete แถว import ที่ source void/หาย/เปลี่ยน association และ soft-delete line items เก่า
- KPI และ consumers ของ `expense_items` filter `is_deleted = false` แล้ว
- Production snapshot หลัง backfill: 114 EXP / 39 PAY (105 paid EXP / 38 paid PAY และ 9 pending EXP / 1 pending PAY); ไม่มี potential duplicates ณ เวลาทดสอบ

### Workflow บันทึกการชำระ PAY ใน KINTSU
- Commits: `64a3d1e`, `01bffdf`; migration `036_payment_slip_local_payments.sql` apply บน Production แล้ว
- เหตุผล: FlowAccount OpenAPI ชำระ EXP ทีละใบได้ แต่ไม่มี endpoint สร้าง/ชำระ PAY รวม จึงไม่ควรยิง payment API ทีละ EXP เพราะจะทำให้ยอดธนาคารหลายรายการไม่ตรงกับสลิปโอนรวมหนึ่งยอด
- Workflow ที่ตกลงกับผู้ใช้:
  1. เปิด PAY ใน KINTSU ดูยอดรวม/รายการ EXP
  2. กด "ชำระและแนบสลิป" เลือกวันที่ บัญชีธนาคาร ยอดโอนจริง และรูปสลิป
  3. สถานะ KINTSU เป็น `ชำระแล้ว — รอบันทึก FlowAccount`
  4. พนักงานบัญชีบันทึกการชำระรวมหนึ่งยอดใน FlowAccount ด้วยมือ
  5. Sync พบ PAY ชำระแล้วและเปลี่ยนสถานะเป็น `ชำระเงินแล้ว`; สลิป local ยังผูกกับ PAY/EXP group เดิม
- หนึ่ง active local payment ต่อหนึ่ง PAY; รองรับแก้ไขก่อน FlowAccount ยืนยัน และไม่มี hard delete
- ถ้ายอดโอนจริงต่างจากยอดสุทธิ PAY ระบบแสดงคำเตือน แต่เก็บยอดจริงตามสลิป
- ปุ่มแนบสลิปเป็นกรอบเส้นประขนาดใหญ่บนมือถือ พร้อมสถานะ uploading/success
- ระบบนี้ไม่เรียก FlowAccount payment API และไม่สร้างรายการบัญชีธนาคารซ้ำ

### เลขเอกสาร FlowAccount ในรายการรายจ่าย
- Commit `d0fabe2`: รายการที่ผู้ใช้บันทึกใน KINTSU และส่ง FlowAccount สำเร็จ แสดง `FlowAccount · EXP...` บนการ์ดโดยไม่ต้องเปิดรายละเอียด
- ไม่แสดงซ้ำกับรายการที่ source เป็น `flowaccount_payment_slip` ซึ่งมี badge PAY อยู่แล้ว

### Migrations ใหม่
- `034_flowaccount_payment_slip_import.sql`
- `035_payment_slip_reconciliation.sql`
- `036_payment_slip_local_payments.sql`
- ทั้งสาม apply บน Supabase Production แล้ว

## งานที่ทำเสร็จ+deploy แล้วคืนนี้/เมื่อคืน (session desktop, 2026-08-23 กลางคืน)
1. **บัญชีธนาคาร → FlowAccount mapping ครบแล้ว** — ผูก `bank_accounts.flowaccount_bank_account_id` ครบทุกบัญชีที่ใช้งานจริง (ทำผ่าน SQL ตรง ไม่ใช่โค้ด)
2. **แก้บั๊กยอด "จำนวนเงินรวมทั้งสิ้น" ผิด** (`3d72340`+`2ca8801`, migration 032/033): เดิมระบบสมมติว่า VAT รวมอยู่ในราคาสินค้าเสมอ (แบบใบเสร็จปลีก) ทำให้บิลแบบใบกำกับภาษี/ใบวางบิลทั่วไป (ราคาก่อน VAT + บวก VAT แยกบรรทัด) ยอดขาดไปเท่ากับ VAT พอดี — ทั้งในแอปเองและยอดที่จะไปมาร์ค "ชำระแล้ว" ใน FlowAccount จริง
   - เพิ่ม field: ส่วนลด (`discount_satang`) + toggle "ราคาไม่รวมภาษี" (default) / "ราคารวมภาษี"
   - สูตร: `จำนวนเงินรวมทั้งสิ้น = (ยอดสินค้า − ส่วนลด) + VAT (ถ้าเลือกราคาไม่รวมภาษี)` แล้ว `ยอดชำระ = จำนวนเงินรวมทั้งสิ้น − หัก ณ ที่จ่าย`
   - `lib/flowaccount.ts` ส่ง `discountAmount`/`totalAfterDiscount`/`grandTotal` จริงไปให้ FlowAccount แล้ว (เดิม hardcode `discountAmount: 0`)
   - **ทดสอบ live ผ่านกับบิลจริง 2 ใบ ยืนยันตัวเลขตรงเป๊ะทั้งในแอปและในเอกสาร FlowAccount จริง**: บิล Optimus (ราคาไม่รวมภาษี ไม่มีส่วนลด) และบิล FlowAccount package renewal (ราคารวมภาษี มีส่วนลด มีหัก ณ ที่จ่าย)
   - แก้บั๊กตามมา: หน้ารายละเอียดไม่โชว์แถว VAT ตอนเลือก "ราคารวมภาษี" — แก้แล้ว โชว์เสมอ

## งานจากเซสชันมือถือ (Claude Code app, 2026-08-24 เช้า) — PR #4-#19, merge หมดแล้ว
- **#4-#6**: วันที่ใบกำกับภาษีอิงจากวันที่บิลจริง (ไม่ใช่วันที่ approve) + date picker เป็น select ภาษาไทยเต็มรูปแบบ (วัน/เดือนไทย/ปี พ.ศ.) แทน native date input ที่โชว์ภาษาตามเครื่องลูกค้า
- **#7-#9**: ตั้งค่าช่องทางรับเงิน FlowAccount (บัญชีธนาคาร/EDC) ได้จากในแอปเอง (Settings > ระบบ) ไม่ต้องพึ่ง env var + redeploy อีกต่อไป — พร้อมแก้บั๊ก RPC gotcha เดิม (ต้องผ่าน `get_settings()` ไม่ query ตรง) และ `contactGroup` ต้องส่งเป็นเลข (1/3) ไม่ใช่ string
- **#10**: แก้ที่อยู่กรุงเทพให้ใช้ แขวง/เขต แทน ตำบล/อำเภอ (Revenue Dept lookup)
- **#11-#17**: แก้ปัญหาอัปโหลดรูปพัง 100% บน Vercel — root cause คือ `sharp` (native binary) โหลดไม่ได้บน Vercel serverless แม้ตั้ง `serverExternalPackages` แล้วก็ตาม สุดท้ายตัด `sharp` ออกทั้งหมด ใช้การบีบอัดรูปฝั่ง browser (canvas) แทน + เพิ่ม `heic2any` (WASM) รองรับไฟล์ HEIC จาก iPhone (canvas ถอดรหัส HEIC เองได้แค่ Safari)
- **#12, #18-#19**: แก้ 3 จุดจากการตรวจเอกสารจริงใน FlowAccount — รหัสไปรษณีย์ซ้ำ (โผล่ทั้งในฟิลด์แยกและท้าย address), ไม่แนบรูปบิลลูกค้าเข้าเอกสาร, PDF ที่ส่งอีเมลมี 2 หน้าซ้ำ (ใบเสร็จรับเงินแยกที่ไม่จำเป็น)

## Migration renumbering (desktop session พบและแก้, `a0c323e`)
- เซสชันมือถือสร้าง migration เลข 030/031 ของตัวเอง ชนกับที่ desktop สร้างไว้เมื่อคืน (คนละตาราง คนละคอลัมน์ ไม่ชนกันจริงในฐานข้อมูล ทั้งคู่ apply ไปแล้ว) — เปลี่ยนเลขไฟล์ desktop เป็น 032/033 ให้ไม่ซ้ำ ไม่มีผลกับ DB

## ค้างอยู่ / ยังไม่ทำ

1. **หัก ณ ที่จ่าย (WHT) การสร้างเอกสารจริงใน FlowAccount** — เป็น decision ที่ปิดไปแล้วโดยเจตนา (user เลือกให้ฝ่ายบัญชีสร้างเองมือ ไม่ auto-create) **อย่าหยิบกลับมาทำใหม่เว้นแต่ user สั่งเอง** — ส่วนที่ทำแล้วคือ OCR ตรวจจับ WHT บนบิล + หักออกจากยอดที่ auto-pay ให้ ทดสอบผ่านแล้ว (บิล FlowAccount package renewal)
2. **ไฟล์ใน working directory ที่ยังไม่ commit/ต้องระวัง**:
   - `.gitignore` มีการแก้ค้างอยู่ (`.claude/settings.local.json`) จากเซสชันก่อนหน้าอีกที ยังไม่มีคำสั่งให้ commit — ปล่อยไว้
   - `app/(dashboard)/expenses/page 2.tsx` ถูกลบแล้วตามคำสั่งผู้ใช้
   - `รหัส-fixed.gs` ที่ root — สคริปต์ GAS เก่าที่มี API key ฝังอยู่ (`[REDACTED]`) — **ห้าม `git add` ไฟล์นี้เด็ดขาด** มี secret อยู่ข้างใน
   - `.claude/`, `notes/` — untracked ตามปกติ ไม่ต้อง track

## Tax invoice revenue account correction (2026-08-26)
- Future customer tax invoices were fixed in commit `ece42f5` and deployed: every tax-invoice item now forces FlowAccount sell account `41210 รายได้จากการให้บริการ`; Cash Invoice behavior was intentionally left unchanged.
- Ten already-paid historical tax invoices could not safely be edited because FlowAccount only permits editing tax invoices in Awaiting status. Preserved every original INV/RV, payment, customer, and VAT record and reclassified the revenue with approved general journals instead:
  - `JV2026070045` dated 2026-07-31: Dr 41110 / Cr 41210, THB 2,064.00, covering INV2026070006 and INV2026070016.
  - `JV2026080048` dated 2026-08-25: Dr 41110 / Cr 41210, THB 13,574.00, covering INV2026080003, 0004, and 0023-0028.
- Each JV contains a separate debit/credit pair referencing the original INV and RV, so the correction is auditable. Total reclassified: THB 15,638.00.
- Both JVs were also recorded in Production `manual_journal_entries` using their JV serial as the reference. Do not recreate these journals.

## Revenue JV ledger descriptions (2026-08-26)
- Implemented and deployed to Production in commit `a82ed13` (`main`, Vercel Ready at `https://kintsu-accounting.vercel.app`).
- Future revenue JV credit lines (account 41210) now use a source/date description visible directly in the FlowAccount chart ledger:
  - TTB: `รายรับพร้อมเพย์ TTB Smart Shop วันที่ YYYY-MM-DD`
  - cash: `รายรับเงินสด วันที่ YYYY-MM-DD`
- The date is dynamic and is the same revenue date used as the JV `documentDate`.
- Production documents for 2026-08-24 were safely replaced through the existing void/recreate lifecycle:
  - `JV2026080045` was voided and replaced by `JV2026080049` (TTB THB 19,708.00).
  - `JV2026080046` was voided and replaced by `JV2026080050` (cash THB 7,584.00).
- Production KINTSU rows now point to the new record IDs and both sync states are `synced`. Do not recreate the old or new documents manually.
- Verified before handoff: full Vitest suite passed (18 passed, 2 skipped) and Next.js Production build passed.

## TTB report-date validation (2026-08-26, commit `17fdcd4`, deployed Production)
- The accounting date for a TTB Smart Shop report is sourced from the bank report itself, not inferred solely from email arrival time or the cron run date.
- Import now requires all three sources to agree before any DB/FlowAccount mutation:
  1. attachment name in exact form `Report_Kintsu-DD-MM-YYYY.xlsx`,
  2. the report summary/cut-off line (`สรุปรายการสำหรับวันที่ DD/MM/YYYY`), and
  3. every `Success` transaction's `Payment Date`.
- Missing or conflicting dates fail closed; no FlowAccount JV is created.
- D-1 remains the cron completeness check, but the validated report date is the JV/document date.
- Validation and the D-1 gate both run before any existing-row lookup, DB repair, or FlowAccount mutation; legacy rows must also match the validated date and amount.
- Verified against the real encrypted `Report_Kintsu-24-08-2026.xlsx`: date 2026-08-24, 28 Success rows, THB 19,708.00.
- Final verification: 22 tests passed (2 live tests skipped), TypeScript passed, Production build passed, and both Spec/Standards reviews passed.

## TTB cron failure alerts (2026-08-26, commit `537fbad`, deployed Production)
- The 03:00 BKK TTB cron now sends a Telegram alert to the `sales` topic whenever it cannot validate/import the expected D-1 report or cannot create/confirm the FlowAccount JV.
- Alert includes the expected report date and HTML-escaped failure reason. It deliberately uses neutral wording (“ไม่สามารถยืนยันการ Sync”) and tells the operator to inspect FlowAccount before retrying because a failed compensating void can leave a JV awaiting cleanup.
- Covered failures include missing D-1 email, invalid/decryption failure, filename/summary/transaction date mismatch, summary amount mismatch, bank/account settings errors, DB errors, and FlowAccount API errors.
- Manual `/api/ttb-promptpay/sync` retains its existing UI error only; Telegram alerts are scoped to the scheduled cron to avoid duplicate operator notifications.
- `sendTelegram()` now verifies both the HTTP response and Telegram's `ok` response and returns `false`/logs when Telegram rejects a message; the cron response also includes `telegramAlertSent` and logs explicitly when both the import and alert delivery fail.
- Verified: 24 tests passed (2 live tests skipped), TypeScript and Production build passed, and both Spec/Standards reviews passed.
- Pushed to `main`; Vercel Production deployment is Ready and aliased at `https://kintsu-accounting.vercel.app`.

## Working conventions ของ repo นี้ (สำคัญ อ่านก่อนเริ่มงาน)
- **Migration**: มี `DATABASE_URL` ใน `.env.local` แล้ว รันตรงผ่าน `psql "$DATABASE_URL" -f supabase/migrations/0NN_xxx.sql` ได้เลย ไม่ต้องให้ user paste ใน Supabase Dashboard
- **Soft delete only** — ทุกตารางมี `is_deleted`/`is_active`, ห้าม hard delete
- **FlowAccount เป็น Production จริง** (บริษัท คิวโซลา จำกัด N304014) ไม่ใช่ Sandbox — ระวังทุกครั้งที่เขียน/ทดสอบ ถ้าต้องสร้างเอกสารทดสอบ ต้องลบ/void คืนหลังทดสอบเสมอ (ผ่าน `deleteExpenseDocument()`/`updateExpense()` — ใช้ได้เฉพาะตอนเอกสารยังเป็น "awaiting"; ถ้า "ชำระแล้ว" ต้อง void ในเว็บ FlowAccount เอง แล้วเช็คด้วย `expense__get_document` field `isDelete` เพื่อยืนยัน ไม่ใช่แค่ดู `statusString`)
- **`git commit` ใช้ `-F <tmpfile>` แทน `$(cat <<'EOF'...)` heredoc** — เจอ `unexpected EOF` เวลาก link กับ `&&` บนเครื่องนี้ ให้เขียนข้อความ commit ลงไฟล์ชั่วคราวก่อนเสมอ
- Vercel auto-deploy ทำงานอยู่ (GitHub integration) — push ขึ้น `main` แล้ว deploy production อัตโนมัติ ไม่ต้อง `vercel deploy` มือ

## Suggested skills สำหรับ session ถัดไป
- งาน feature/fix: `mattpocock-skills:implement` + `mattpocock-skills:tdd`
- ก่อนส่งมอบ code change: `mattpocock-skills:code-review`
- ปัญหา Production หรือยอดบัญชีไม่ตรง: `mattpocock-skills:diagnosing-bugs`
