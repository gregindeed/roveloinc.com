-- ── Schedule E rental + itemized deductions / credits ───────────────────────
-- Two more pieces of the individual return: rental & royalty income (Schedule E)
-- and itemized deductions + a manual credits figure that feed the Planning tab.
-- Scoped to a client (individual) AND a tax year. Re-runnable.
-- Run AFTER structured-income.sql (same RLS helpers).

-- ── Schedule E — rental / royalty properties ────────────────────────────────
create table if not exists public.schedule_e (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  year               int  not null,
  property_label     text not null,        -- "123 Main St", "Duplex — Reno", etc.
  property_type      text default 'residential', -- residential | commercial | land | royalty | other
  address            text,
  rents_received     numeric not null default 0,
  expenses           jsonb   not null default '{}'::jsonb, -- Schedule E line categories incl. depreciation
  created_at         timestamptz not null default now()
);
create index if not exists schedule_e_client_year_idx on public.schedule_e(client_id, year);

-- ── Itemized deductions + credits (one row per client per year) ─────────────
create table if not exists public.tax_deductions (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  year               int  not null,
  medical            numeric not null default 0,   -- before the 7.5%-of-AGI floor
  state_local_taxes  numeric not null default 0,   -- SALT (capped in the engine)
  mortgage_interest  numeric not null default 0,
  charitable         numeric not null default 0,
  other_itemized     numeric not null default 0,
  estimated_credits  numeric not null default 0,   -- manual total of tax credits
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, year)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.schedule_e     enable row level security;
alter table public.tax_deductions enable row level security;

drop policy if exists schedule_e_read      on public.schedule_e;
drop policy if exists schedule_e_write     on public.schedule_e;
drop policy if exists tax_deductions_read  on public.tax_deductions;
drop policy if exists tax_deductions_write on public.tax_deductions;

create policy schedule_e_read on public.schedule_e for select
  using (public.can_read_entity(client_id));
create policy schedule_e_write on public.schedule_e for all
  using (public.can_write_entity(client_id))
  with check (public.can_write_entity(client_id));

create policy tax_deductions_read on public.tax_deductions for select
  using (public.can_read_entity(client_id));
create policy tax_deductions_write on public.tax_deductions for all
  using (public.can_write_entity(client_id))
  with check (public.can_write_entity(client_id));

notify pgrst, 'reload schema';
