-- ── Foreign / nonresident owner tax profile ─────────────────────────────────
-- Individuals may file with an ITIN and be nonresident aliens (Form 1040-NR),
-- whose US-source dividends are taxed at a flat 30% or a reduced tax-treaty rate.
-- These columns drive the residency-aware tax estimate on the Planning tab.
-- Re-runnable. Run AFTER people-foundation.sql.

alter table public.clients add column if not exists residency text
  check (residency in ('resident', 'nonresident'));            -- null → treated as resident
alter table public.clients add column if not exists tax_id_type text
  check (tax_id_type in ('ssn', 'itin'));                       -- how they file
alter table public.clients add column if not exists treaty_country text;         -- e.g. 'MX'
alter table public.clients add column if not exists treaty_dividend_rate numeric; -- e.g. 0.10 (10%)

notify pgrst, 'reload schema';
