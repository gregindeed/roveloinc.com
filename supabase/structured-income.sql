-- ── Structured income for individuals (1040 filers) ─────────────────────────
-- Captures the *line data* behind a personal return, not just the filed PDF:
-- W-2 wages, the 1099 family, and Schedule C self-employment. All rows are
-- scoped to a client (an individual) AND a tax year, so the overview can total
-- income per year. Businesses never use these tables — they have a ledger.
-- Re-runnable. Run AFTER people-foundation.sql (uses can_read_entity /
-- can_write_entity and clients.kind).

-- ── W-2 wage income ──────────────────────────────────────────────────────────
create table if not exists public.w2_income (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients(id) on delete cascade,
  year                  int  not null,
  employer_name         text not null,
  employer_ein          text,
  wages                 numeric not null default 0,   -- box 1
  fed_withholding       numeric not null default 0,   -- box 2
  ss_wages              numeric,                       -- box 3
  ss_withholding        numeric,                       -- box 4
  medicare_wages        numeric,                       -- box 5
  medicare_withholding  numeric,                       -- box 6
  state                 text,                          -- box 15
  state_wages           numeric,                       -- box 16
  state_withholding     numeric,                       -- box 17
  document_id           uuid references public.documents(id) on delete set null,
  created_at            timestamptz not null default now()
);
create index if not exists w2_income_client_year_idx on public.w2_income(client_id, year);

-- ── 1099 family (NEC, MISC, INT, DIV, K, G, R, B, SSA, …) ────────────────────
create table if not exists public.income_1099 (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  year             int  not null,
  form_type        text not null default 'nec',  -- nec | misc | int | div | k | g | r | b | ssa | other
  payer_name       text not null,
  payer_tin        text,
  amount           numeric not null default 0,   -- the headline box for this form
  fed_withholding  numeric not null default 0,
  description      text,                          -- which box / nature, free text
  document_id      uuid references public.documents(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists income_1099_client_year_idx on public.income_1099(client_id, year);

-- ── Schedule C — self-employment / sole-prop business on a 1040 ──────────────
-- One person can run several. Expenses are the Schedule C Part II line
-- categories; kept as jsonb ({ advertising: 1200, car: 800, ... }) so the set
-- can evolve without a migration. Net = gross_receipts - returns - cogs - Σexpenses.
create table if not exists public.schedule_c (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  year                int  not null,
  business_name       text not null,
  principal_activity  text,
  naics_code          text,
  accounting_method   text default 'cash',   -- cash | accrual
  gross_receipts      numeric not null default 0,
  returns_allowances  numeric not null default 0,
  cogs                numeric not null default 0,
  expenses            jsonb   not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists schedule_c_client_year_idx on public.schedule_c(client_id, year);

-- ── RLS — visible/editable to anyone who can read/write the client ───────────
alter table public.w2_income    enable row level security;
alter table public.income_1099  enable row level security;
alter table public.schedule_c   enable row level security;

drop policy if exists w2_income_read     on public.w2_income;
drop policy if exists w2_income_write    on public.w2_income;
drop policy if exists income_1099_read   on public.income_1099;
drop policy if exists income_1099_write  on public.income_1099;
drop policy if exists schedule_c_read    on public.schedule_c;
drop policy if exists schedule_c_write   on public.schedule_c;

create policy w2_income_read on public.w2_income for select
  using (public.can_read_entity(client_id));
create policy w2_income_write on public.w2_income for all
  using (public.can_write_entity(client_id))
  with check (public.can_write_entity(client_id));

create policy income_1099_read on public.income_1099 for select
  using (public.can_read_entity(client_id));
create policy income_1099_write on public.income_1099 for all
  using (public.can_write_entity(client_id))
  with check (public.can_write_entity(client_id));

create policy schedule_c_read on public.schedule_c for select
  using (public.can_read_entity(client_id));
create policy schedule_c_write on public.schedule_c for all
  using (public.can_write_entity(client_id))
  with check (public.can_write_entity(client_id));

notify pgrst, 'reload schema';
