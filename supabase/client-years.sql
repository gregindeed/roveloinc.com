-- ── Tax-year layer (engagements are period-scoped) ───────────────────────────
-- An entity is ONE persistent business (shared EIN, type, owners, permanent
-- docs). The work is organized into tax years you OPEN, work in, and CLOSE.
-- A closed year is locked read-only (a manager can reopen). This mirrors how
-- professional tax software works: one client, many years. Re-runnable.

create table if not exists public.client_years (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  year       int  not null,
  status     text not null default 'active',   -- active | closed
  opened_at  timestamptz not null default now(),
  closed_at  timestamptz,
  closed_by  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, year)
);
create index if not exists client_years_client_idx on public.client_years (client_id, year desc);

alter table public.client_years enable row level security;
drop policy if exists client_years_read  on public.client_years;
drop policy if exists client_years_write on public.client_years;
create policy client_years_read  on public.client_years for select using (public.can_read_entity(client_id));
create policy client_years_write on public.client_years for all
  using (public.can_write_entity(client_id)) with check (public.can_write_entity(client_id));

-- Backfill: open every year that already has data, plus the current year, so
-- nothing an existing entity has worked on disappears.
insert into public.client_years (client_id, year, status)
select s.client_id, s.yr, 'active'
from (
  select client_id, extract(year from txn_date)::int  as yr from public.deposits
  union
  select client_id, extract(year from txn_date)::int      from public.checking_expenses
  union
  select client_id, extract(year from post_date)::int     from public.cc_transactions
  union
  select id as client_id, extract(year from now())::int   from public.clients
) s
where s.yr is not null and s.client_id is not null
on conflict (client_id, year) do nothing;

notify pgrst, 'reload schema';
