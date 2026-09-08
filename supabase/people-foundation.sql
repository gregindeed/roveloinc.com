-- ── People + individuals foundation ──────────────────────────────────────────
-- A client is now either a business (default, unchanged) or an individual — a
-- person / 1040 filer. Individuals carry a filing status. A relationships table
-- links a person to the entities they own or run, so one human (Francisco) can
-- tie to many businesses and their own personal record. Re-runnable.
-- Run AFTER firms.sql / memberships.sql (uses can_read_entity / can_write_entity).

alter table public.clients add column if not exists kind text not null default 'business'
  check (kind in ('business', 'individual'));
-- individuals: single | mfj | mfs | hoh | qw (qualifying widow[er])
alter table public.clients add column if not exists filing_status text;

create table if not exists public.client_relationships (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.clients(id) on delete cascade,  -- the individual
  entity_id     uuid not null references public.clients(id) on delete cascade,  -- the business
  role          text not null default 'owner',  -- owner | officer | member | manager | signer | related
  ownership_pct numeric,
  created_at    timestamptz not null default now(),
  unique (person_id, entity_id, role)
);
create index if not exists client_rel_person_idx on public.client_relationships(person_id);
create index if not exists client_rel_entity_idx on public.client_relationships(entity_id);
alter table public.client_relationships enable row level security;

-- Visible/editable if you can read/write EITHER side of the link.
drop policy if exists client_rel_read  on public.client_relationships;
drop policy if exists client_rel_write on public.client_relationships;
create policy client_rel_read on public.client_relationships for select
  using (public.can_read_entity(person_id) or public.can_read_entity(entity_id));
create policy client_rel_write on public.client_relationships for all
  using (public.can_write_entity(person_id) or public.can_write_entity(entity_id))
  with check (public.can_write_entity(person_id) or public.can_write_entity(entity_id));

notify pgrst, 'reload schema';
