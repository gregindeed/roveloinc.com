-- ============================================================================
-- roveloinc.com — Phase 1: entity records + typed document vault
-- Run in the Supabase SQL editor, after schema.sql and documents.sql.
-- Safe to re-run (idempotent).
-- ============================================================================

-- ---------- Entity type ----------
do $$ begin
  create type public.entity_type as enum
    ('sole_prop', 'partnership', 'llc', 's_corp', 'c_corp', 'nonprofit', 'other');
exception when duplicate_object then null; end $$;

-- ---------- Extend clients into full CA entity records ----------
alter table public.clients
  add column if not exists entity_type    public.entity_type,
  add column if not exists ein             text,   -- Federal EIN
  add column if not exists ca_sos_number   text,   -- CA Secretary of State entity number
  add column if not exists cdtfa_account   text,   -- Seller's permit / sales & use tax acct
  add column if not exists edd_account     text,   -- EDD payroll tax acct
  add column if not exists ftb_id          text,   -- FTB entity id (if applicable)
  add column if not exists formation_date  date,
  add column if not exists fiscal_year_end text default '12-31',  -- MM-DD
  add column if not exists naics_code      text,
  add column if not exists phone           text,
  add column if not exists email           text,
  add column if not exists status          text not null default 'active',
  add column if not exists notes           text;

-- ---------- Document type + agency + dates ----------
do $$ begin
  create type public.document_type as enum
    ('business_license', 'sellers_permit', 'articles', 'ein_letter',
     'statement_of_information', 'insurance', 'lease', 'bank_statement',
     'tax_return', 'agency_notice', 'receipt', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gov_agency as enum
    ('cdtfa', 'ftb', 'edd', 'irs', 'sos', 'city', 'county', 'other');
exception when duplicate_object then null; end $$;

alter table public.documents
  add column if not exists doc_type     public.document_type not null default 'other',
  add column if not exists agency       public.gov_agency,
  add column if not exists issued_date  date,
  add column if not exists expires_date date;

create index if not exists documents_expires_idx on public.documents(expires_date)
  where expires_date is not null;

-- RLS is unchanged: admins manage entity fields; clients still read their own
-- entity + docs and upload their own docs (existing policies already cover the
-- new columns).
